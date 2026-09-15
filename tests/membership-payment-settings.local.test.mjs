import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

test("payment settings require an active officer and preserve version history and actor role", () => {
  readLocalSupabaseEnvironment("Payment settings permission test");
  execFileSync("docker", ["exec", "-i", "supabase_db_ydsme_v5", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { encoding: "utf8", input: `
begin;
do $$
declare
  actor uuid;
  previous_id uuid;
  saved_id uuid;
  test_actor_role text;
  p public.membership_payment_settings_versions;
begin
  select u.id into strict actor from public.users u join public.user_roles r on r.user_id=u.id
    where u.membership_status='active' and r.role='member' limit 1;
  select * into strict p from public.membership_payment_settings_versions where active;
  previous_id := p.id;
  foreach test_actor_role in array array['member','committee','officer','suspended-officer','administrator'] loop
    update public.user_roles set role=(case when test_actor_role in ('officer','suspended-officer') then 'committee' else test_actor_role end) where user_id=actor;
    if test_actor_role in ('officer','suspended-officer') then
      insert into public.user_capabilities(user_id,capability) values(actor,'memberships.manage') on conflict do nothing;
    end if;
    update public.users set membership_status=case when test_actor_role='suspended-officer' then 'suspended' else 'active' end where id=actor;
    begin
      saved_id := public.replace_membership_payment_settings(actor,p.treasurer_name,p.treasurer_email,p.treasurer_phone,p.bank_account_name,p.bank_sort_code,p.bank_account_number,p.bank_transfer_instructions,p.cheque_payee,p.cheque_delivery_instructions,p.cash_instructions);
      if test_actor_role not in ('officer','administrator') then raise exception 'Unexpected permission for %',test_actor_role; end if;
      if not exists(select 1 from public.membership_payment_settings_versions where id=previous_id and not active) then raise exception 'Previous version lost'; end if;
      if not exists(select 1 from public.audit_logs where entity_id=saved_id::text and actor_user_id=actor and actor_role=(case when test_actor_role='officer' then 'committee' else 'administrator' end)) then raise exception 'Incorrect audit actor'; end if;
    exception when others then
      if sqlerrm <> 'membership_payment_settings_forbidden' or test_actor_role in ('officer','administrator') then raise; end if;
    end;
  end loop;
end $$;
rollback;
` });
});
