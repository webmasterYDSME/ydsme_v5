-- Activation is now combined with the account invitation email, so portal
-- notices must not promise a separate invitation message.

create or replace function public.normalise_membership_activation_notice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'membership.activated' then
    new.body := replace(new.body, ' We will send your secure portal invitation separately.', '');
  end if;
  return new;
end;
$$;

revoke all on function public.normalise_membership_activation_notice() from public, anon, authenticated;
drop trigger if exists normalise_membership_activation_notice on public.membership_notifications;
create trigger normalise_membership_activation_notice
before insert on public.membership_notifications
for each row execute function public.normalise_membership_activation_notice();

update public.membership_notifications
set body = replace(body, ' We will send your secure portal invitation separately.', ''),
    updated_at = now()
where kind = 'membership.activated'
  and body like '% We will send your secure portal invitation separately.';

