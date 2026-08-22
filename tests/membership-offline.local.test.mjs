import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("preserves officer attribution and enforces offline membership evidence locally", (t) => {
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  if (status.status !== 0) return t.skip("Local Supabase is not running.");
  const apiUrl = status.stdout.match(/^API_URL="([^"]+)"$/m)?.[1];
  assert.ok(apiUrl);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(new URL(apiUrl).hostname));
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId);

  const sql = String.raw`
begin;
do $test$
declare
  v_actor uuid := gen_random_uuid();
  v_backup_administrator_one uuid := gen_random_uuid();
  v_backup_administrator_two uuid := gen_random_uuid();
  v_plan uuid;
  v_member uuid;
  v_term uuid;
  v_payment uuid;
  v_pending_member uuid;
  v_pending_term uuid;
  v_pending_payment uuid;
  v_price uuid;
  v_year integer;
  v_amount integer;
  v_honorary uuid;
  v_actor_record uuid;
begin
  update public.user_roles set role='member' where role='administrator';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_actor,'authenticated','authenticated','offline-officer-'||v_actor||'@example.invalid',now(),'{"full_name":"Offline Membership Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=v_actor;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_backup_administrator_one,'authenticated','authenticated','backup-administrator-one-'||v_backup_administrator_one||'@example.invalid',now(),
    '{"full_name":"Backup Administrator One"}',now(),now());
  update public.user_roles set role='administrator' where user_id=v_backup_administrator_one;
  begin
    update public.users set membership_status='archived' where id=v_actor;
    raise exception 'Two-administrator minimum was not enforced';
  exception when others then
    if sqlerrm not like '%minimum_two_active_administrators_required%' then raise; end if;
  end;
  if (select membership_status from public.users where id=v_actor)<>'active' then
    raise exception 'Blocked administrator archive changed the account state';
  end if;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_backup_administrator_two,'authenticated','authenticated','backup-administrator-two-'||v_backup_administrator_two||'@example.invalid',now(),
    '{"full_name":"Backup Administrator Two"}',now(),now());
  update public.user_roles set role='administrator' where user_id=v_backup_administrator_two;
  select id into v_plan from public.membership_plans where slug='adult';

  select member_id,term_id,payment_id into v_member,v_term,v_payment
  from public.create_officer_managed_membership(
    p_plan_id=>v_plan,p_full_name=>'Synthetic No-email Member',p_date_of_birth=>'1980-04-02',
    p_payment_method=>'bank_transfer',p_payment_received=>true,p_payment_reference=>'MEM-TESTBANK',
    p_received_on=>current_date,p_actor_id=>v_actor,p_contact_number=>'01904 000000'
  );
  select recorded_by_actor_id into v_actor_record from public.membership_payments where id=v_payment;
  if v_actor_record is null or (select method from public.membership_payments where id=v_payment)<>'bank_transfer' then
    raise exception 'Offline payment did not retain durable actor evidence';
  end if;

  select price.id,price.membership_year,public.prorated_membership_fee_pence(price.amount_pence,current_date)
    into v_price,v_year,v_amount
  from public.membership_plan_prices price where price.plan_id=v_plan
    and price.membership_year=public.membership_billing_year(current_date) and price.active;
  select member_id,term_id,payment_id into v_pending_member,v_pending_term,v_pending_payment
  from public.create_officer_managed_membership(
    p_plan_id=>v_plan,p_full_name=>'Synthetic Pending Bank Member',p_date_of_birth=>'1975-02-14',
    p_payment_method=>'bank_transfer',p_payment_received=>false,p_payment_reference=>null,
    p_received_on=>current_date,p_actor_id=>v_actor,p_contact_number=>'01904 000001'
  );
  select member_id,term_id,payment_id into v_pending_member,v_pending_term,v_pending_payment
  from public.activate_offline_membership_renewal(
    v_pending_member,v_price,v_year,'bank_transfer',v_amount,current_date,'MEM-PENDINGBANK',v_actor
  );
  if (select effective_state from public.members where id=v_pending_member)<>'active'
    or (select status from public.membership_terms where id=v_pending_term)<>'paid'
    or (select method from public.membership_payments where id=v_pending_payment)<>'bank_transfer' then
    raise exception 'Pending officer-created membership did not activate after full payment';
  end if;

  select public.grant_lifetime_honorary_membership(v_member,current_date,'Long service to the Society.',v_actor) into v_honorary;
  perform public.revoke_lifetime_honorary_membership(v_honorary,current_date,v_plan,'Honorary status corrected by the Society.',v_actor);
  if not exists(select 1 from public.membership_notifications where member_id=v_member and kind='membership.manual-contact-officer') then
    raise exception 'Email-less honorary change did not create a manual contact task';
  end if;

  perform public.report_offline_membership_payment_failure(
    v_payment,'Synthetic bank transfer was reversed by the bank.',v_actor
  );
  if (select status from public.membership_payments where id=v_payment)<>'failed'
    or (select status from public.membership_terms where id=v_term)<>'payment_review'
    or not exists(
      select 1 from public.audit_logs
      where action='membership.offline-payment-failed' and entity_id=v_payment::text
    ) then
    raise exception 'Offline payment failure did not create an auditable payment review';
  end if;

  update public.users set membership_status='archived' where id=v_actor;
  if exists(select 1 from public.user_capabilities where user_id=v_actor)
    or exists(select 1 from public.user_roles where user_id=v_actor and role<>'member') then
    raise exception 'Archiving did not offboard the officer';
  end if;
  delete from auth.users where id=v_actor;
  if (select received_by from public.membership_payments where id=v_payment) is not null
    or (select recorded_by_actor_id from public.membership_payments where id=v_payment) is null
    or not exists(select 1 from public.administrative_actors where id=v_actor_record and auth_user_id is null and status='former' and display_name like 'Former membership officer%') then
    raise exception 'Auth deletion did not preserve anonymised financial attribution';
  end if;
  if (select revoked_by_actor_id from public.honorary_memberships where id=v_honorary) is null then
    raise exception 'Honorary decision attribution was lost';
  end if;

  begin
    insert into public.membership_applications(
      requested_plan_id,full_name,contact_email,date_of_birth,guardian_name,guardian_email,guardian_consent,
      payment_method,auto_renew,status,verification_token_hash,verification_expires_at,email_verified_at,terms_version,terms_accepted_at
    ) values(
      (select id from public.membership_plans where slug='junior'),'Synthetic Junior','junior@example.invalid','2010-01-01',
      'Synthetic Guardian','guardian@example.invalid',true,'cash',false,'awaiting_approval',repeat('a',64),now()+interval '1 day',now(),'test',now()
    );
    raise exception 'Unverified guardian application advanced';
  exception when check_violation then null;
  end;
end;
$test$;
rollback;`;
  const result = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ROLLBACK/);
});
