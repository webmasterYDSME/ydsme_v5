-- Members can subscribe to, or leave, the Society newsletter from their own account page.
--
-- Subscribing records when and how (source "member_account"); leaving clears the record, and the audit log
-- keeps the history. Leaving only affects the member who chose it: the mailbox-wide unsubscribe link in
-- newsletters is unchanged. Subscribing again lifts a mailbox-wide unsubscribe, but never a block placed
-- because emails to that address bounced or were reported.

alter table public.members drop constraint if exists members_newsletter_consent_source_check;
alter table public.members add constraint members_newsletter_consent_source_check
  check (newsletter_consent_source is null
    or newsletter_consent_source in ('paper_form','in_person','phone','membermojo_list','member_account'));

-- What the account page needs to show: whether the signed-in member is on the newsletter list, and why not.
create or replace function public.get_own_newsletter_preference()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member record;
  v_email text;
  v_mailbox_unsubscribed boolean;
  v_address_blocked boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select id, contact_email, newsletter_opt_in, newsletter_consent_given_on, newsletter_consent_source
  into v_member from public.members where auth_user_id = v_user and anonymized_at is null;
  if not found then return jsonb_build_object('linked', false); end if;

  v_email := lower(btrim(coalesce(v_member.contact_email, '')));
  if v_email <> '' then
    select newsletter_suppressed, transactional_suppressed into v_mailbox_unsubscribed, v_address_blocked
    from public.membership_email_suppressions where normalized_email = v_email;
  end if;
  v_mailbox_unsubscribed := coalesce(v_mailbox_unsubscribed, false);
  v_address_blocked := coalesce(v_address_blocked, false);

  return jsonb_build_object(
    'linked', true,
    'email', nullif(v_email, ''),
    'subscribed', v_member.newsletter_opt_in and not v_mailbox_unsubscribed and not v_address_blocked,
    'opted_in', v_member.newsletter_opt_in,
    'mailbox_unsubscribed', v_mailbox_unsubscribed,
    'address_blocked', v_address_blocked,
    'since', case when v_member.newsletter_opt_in then v_member.newsletter_consent_given_on end,
    'source', case when v_member.newsletter_opt_in then v_member.newsletter_consent_source end
  );
end;
$$;

create or replace function public.set_own_newsletter_preference(p_subscribe boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.members%rowtype;
  v_email text;
  v_mailbox_unsubscribed boolean;
  v_address_blocked boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_subscribe is null then raise exception 'newsletter_choice_required'; end if;
  select * into v_member from public.members where auth_user_id = v_user and anonymized_at is null for update;
  if not found then raise exception 'newsletter_member_not_found'; end if;

  v_email := lower(btrim(coalesce(v_member.contact_email, '')));
  if v_email <> '' then
    select newsletter_suppressed, transactional_suppressed into v_mailbox_unsubscribed, v_address_blocked
    from public.membership_email_suppressions where normalized_email = v_email;
  end if;
  v_mailbox_unsubscribed := coalesce(v_mailbox_unsubscribed, false);
  v_address_blocked := coalesce(v_address_blocked, false);

  if p_subscribe then
    if v_email = '' then raise exception 'newsletter_email_required'; end if;
    if v_address_blocked then raise exception 'newsletter_address_blocked'; end if;
    if not (v_member.newsletter_opt_in and not v_mailbox_unsubscribed) then
      update public.members set
        newsletter_opt_in = true, newsletter_consent_source = 'member_account',
        newsletter_consent_given_on = current_date, newsletter_consent_recorded_at = now(),
        newsletter_consent_recorded_by_actor_id = null, updated_at = now()
      where id = v_member.id;
      update public.membership_email_suppressions
      set newsletter_suppressed = false, reason = 'The member subscribed again from their account page.', updated_at = now()
      where normalized_email = v_email and newsletter_suppressed;
      insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
      values (v_user, 'member', 'member.newsletter-subscribed', 'member', v_member.id::text, 'Subscribed to the Society newsletter from the account page.');
    end if;
  elsif v_member.newsletter_opt_in then
    update public.members set
      newsletter_opt_in = false, newsletter_consent_source = null, newsletter_consent_given_on = null,
      newsletter_consent_recorded_at = null, newsletter_consent_recorded_by_actor_id = null, updated_at = now()
    where id = v_member.id;
    insert into public.audit_logs(actor_user_id, actor_role, action, entity_type, entity_id, summary)
    values (v_user, 'member', 'member.newsletter-unsubscribed', 'member', v_member.id::text, 'Unsubscribed from the Society newsletter on the account page.');
  end if;

  return public.get_own_newsletter_preference();
end;
$$;

revoke all on function public.get_own_newsletter_preference() from public, anon;
revoke all on function public.set_own_newsletter_preference(boolean) from public, anon;
grant execute on function public.get_own_newsletter_preference() to authenticated, service_role;
grant execute on function public.set_own_newsletter_preference(boolean) to authenticated, service_role;
