-- Keep payment-provider details in financial/audit records while using plain
-- language in notices sent to members.

update public.membership_notifications
set body = replace(
  replace(
    body,
    'The reviewed payment no longer covers this term. Please arrange a replacement Stripe or cash payment.',
    'The reviewed payment no longer covers this term. Please arrange a replacement online or offline payment.'
  ),
  'The renewal grace period has ended and portal access is now closed. A full Stripe or cash renewal can reinstate membership.',
  'The renewal grace period has ended and account access is now closed. A complete online or offline renewal can reinstate membership.'
), updated_at = now()
where body like '%Stripe%';

create or replace function public.resolve_membership_payment_review(
  p_term_id uuid,
  p_resolution text,
  p_reason text,
  p_actor_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_term public.membership_terms%rowtype;
  v_member public.members%rowtype;
  v_new_state text;
begin
  if not public.has_membership_management_capability(p_actor_id)
    or p_resolution not in ('retain','replace','lapse')
    or nullif(btrim(p_reason),'') is null or char_length(btrim(p_reason))<5 then
    raise exception 'membership_payment_review_resolution_invalid';
  end if;
  select * into v_term from public.membership_terms where id=p_term_id and status='payment_review' for update;
  if not found then raise exception 'membership_payment_review_unavailable'; end if;
  select * into v_member from public.members where id=v_term.member_id for update;
  if p_resolution='retain' then
    update public.membership_terms set status='paid', updated_at=now() where id=v_term.id;
    v_new_state := 'active';
  elsif p_resolution='replace' then
    update public.membership_terms set status='void', amount_paid_pence=0, updated_at=now() where id=v_term.id;
    v_new_state := case when current_date <= make_date(extract(year from current_date)::integer,2,28)
      then 'grace' else 'lapsed' end;
  else
    update public.membership_terms set status='lapsed', updated_at=now() where id=v_term.id;
    v_new_state := 'lapsed';
  end if;
  if v_member.effective_state not in ('honorary','suspended','archived') then
    update public.members set effective_state=v_new_state, updated_at=now() where id=v_member.id;
    if v_member.auth_user_id is not null then
      update public.users set membership_status=case when v_new_state='lapsed' then 'lapsed' else 'active' end,
        updated_at=now() where id=v_member.auth_user_id;
    end if;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    v_member.id,v_member.auth_user_id,v_member.contact_email,'membership.payment-review-resolved',
    'Your membership payment review is complete',
    case p_resolution
      when 'retain' then 'A membership officer retained your paid entitlement after review.'
      when 'replace' then 'The reviewed payment no longer covers this term. Please arrange a replacement online or offline payment.'
      else 'Your paid entitlement ended following the payment review.' end,
    '/account','membership-review-resolved-' || v_term.id::text || '-' || p_resolution
  );
  insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,summary,before_state,after_state)
  values(p_actor_id,'committee','membership.payment-review-resolved','membership_term',v_term.id::text,
    'Membership payment review resolved.',jsonb_build_object('status',v_term.status),
    jsonb_build_object('resolution',p_resolution,'reason',btrim(p_reason),'member_state',v_new_state));
  return true;
end;
$$;

create or replace function public.notify_membership_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.effective_state=old.effective_state then return new; end if;
  if new.effective_state='grace' then
    v_kind:='membership.grace'; v_title:='Your membership is in its grace period';
    v_body:='Account access continues through February. Complete renewal before 1 March to avoid a lapse.';
  elsif new.effective_state='lapsed' then
    v_kind:='membership.lapsed'; v_title:='Your membership has lapsed';
    v_body:='The renewal grace period has ended and account access is now closed. A complete online or offline renewal can reinstate membership.';
  elsif new.effective_state='active' and old.effective_state in ('grace','lapsed','payment_review') then
    v_kind:='membership.reinstated'; v_title:='Your membership is active again';
    v_body:='Your paid membership and account access have been reinstated.';
  else return new;
  end if;
  insert into public.membership_notifications(
    member_id,recipient_user_id,recipient_email,kind,title,body,action_href,deduplication_key
  ) values (
    new.id,new.auth_user_id,new.contact_email,v_kind,v_title,v_body,'/account',
    'membership-state-' || new.id::text || '-' || new.effective_state || '-' || current_date::text
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;

