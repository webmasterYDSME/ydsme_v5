-- Future paid terms must become an explicit officer task when honorary status
-- is granted. The payment remains untouched until an officer records a decision.

create or replace function public.alert_officers_for_honorary_payment_conflict()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind='membership.honorary-payment-review' then
    insert into public.membership_notifications(
      member_id,recipient_user_id,kind,title,body,action_href,email_status,deduplication_key
    )
    select new.member_id,officer.user_id,'membership.honorary-payment-review-officer',
      'Honorary membership has a paid-term conflict',
      'A paid term already covers the honorary effective year. Review the payment in Stripe/history and record whether it is retained or handled separately; no automatic refund has occurred.',
      '/admin/memberships?queue=honorary-payment-review', 'queued',
      'honorary-payment-review-officer-' || new.id::text || '-' || officer.user_id::text
    from (
      select role.user_id from public.user_roles role where role.role='administrator'
      union
      select capability.user_id from public.user_capabilities capability where capability.capability='memberships.manage'
    ) officer on conflict(deduplication_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists honorary_payment_conflict_officer_alert on public.membership_notifications;
create trigger honorary_payment_conflict_officer_alert
after insert on public.membership_notifications
for each row execute function public.alert_officers_for_honorary_payment_conflict();
