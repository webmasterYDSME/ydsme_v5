-- Name the member in shared-mailbox honorary correspondence and ensure an
-- immediate designation produces one meaningful message, not a scheduled
-- notice followed immediately by an activation notice.
create or replace function public.consolidate_honorary_membership_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_member public.members%rowtype;
begin
  select * into v_member from public.members where id=new.member_id;
  if new.status='scheduled' and tg_op='INSERT' then
    update public.membership_notifications notification
    set title=v_member.full_name||'''s lifetime honorary membership is scheduled',
        body=format('%s, your lifetime honorary membership will take effect on %s. No membership payment will be due after that date.',
          v_member.full_name,to_char(new.effective_from,'FMDD FMMonth YYYY')),
        updated_at=now()
    where notification.deduplication_key='honorary-scheduled-'||new.id::text;
  elsif new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
    if tg_op='INSERT' then
      update public.membership_notifications notification
      set email_status='cancelled',updated_at=now()
      where notification.deduplication_key='honorary-scheduled-'||new.id::text
        and notification.email_status in ('queued','failed');
    end if;
    update public.membership_notifications notification
    set title=v_member.full_name||'''s lifetime honorary membership is active',
        body=format('%s, your lifetime honorary membership is now active. No membership fee, renewal or payment reminder applies while this entitlement remains active.',
          v_member.full_name),
        updated_at=now()
    where notification.deduplication_key='honorary-activated-'||new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_honorary_membership_notice_consistency on public.honorary_memberships;
create trigger zz_honorary_membership_notice_consistency
after insert or update of status on public.honorary_memberships
for each row execute function public.consolidate_honorary_membership_notice();

revoke all on function public.consolidate_honorary_membership_notice() from public,anon,authenticated;
grant execute on function public.consolidate_honorary_membership_notice() to service_role;
