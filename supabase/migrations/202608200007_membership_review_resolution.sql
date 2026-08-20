-- Recover abandoned delivery claims and give officers a controlled resolution
-- workflow for full refunds and disputes.

drop function if exists public.claim_membership_notifications(integer);
create function public.claim_membership_notifications(p_limit integer default 25)
returns table(
  notification_id uuid, member_id uuid, recipient_email text, title text, body text,
  kind text, action_href text, email_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select notification.id
    from public.membership_notifications notification
    where (
        notification.email_status in ('queued','failed')
        or (notification.email_status='sending' and notification.updated_at < now() - interval '15 minutes')
      )
      and notification.recipient_email is not null
      and notification.scheduled_for <= now()
      and notification.email_attempts < 5
    order by notification.scheduled_for, notification.created_at
    for update skip locked
    limit greatest(1, least(p_limit,100))
  ), claimed as (
    update public.membership_notifications notification
    set email_status='sending', email_attempts=notification.email_attempts+1,
        last_email_error=null, updated_at=now()
    from candidates where notification.id=candidates.id
    returning notification.*
  )
  select claimed.id, claimed.member_id, claimed.recipient_email, claimed.title, claimed.body,
    claimed.kind, claimed.action_href, claimed.email_attempts from claimed;
end;
$$;
revoke all on function public.claim_membership_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_membership_notifications(integer) to service_role;

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
      when 'replace' then 'The reviewed payment no longer covers this term. Please arrange a replacement Stripe or cash payment.'
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

revoke all on function public.resolve_membership_payment_review(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.resolve_membership_payment_review(uuid,text,text,uuid) to service_role;
