import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("enforces atomic cash, honorary and access-precedence membership contracts locally", (t) => {
  const status = spawnSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  if (status.status !== 0) return t.skip("Local Supabase is not running.");
  const apiUrl = status.stdout.match(/^API_URL="([^"]+)"$/m)?.[1];
  assert.ok(apiUrl, "Supabase status did not return API_URL.");
  const endpoint = new URL(apiUrl);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname), `Refusing data-writing test against ${endpoint.hostname}.`);
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId);

  const sql = String.raw`
begin;
do $test$
declare
  v_actor uuid := gen_random_uuid();
  v_portal uuid := gen_random_uuid();
  v_application uuid := gen_random_uuid();
  v_plan uuid;
  v_price uuid;
  v_member uuid;
  v_term uuid;
  v_payment uuid;
  v_honorary uuid;
  v_amount integer;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_actor,'authenticated','authenticated','membership-officer-'||v_actor||'@example.invalid',now(),'{"full_name":"Synthetic Membership Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=v_actor;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_portal,'authenticated','authenticated','membership-member-'||v_portal||'@example.invalid',now(),'{"full_name":"Synthetic Paid Member"}',now(),now());

  select plan.id, price.id, public.prorated_membership_fee_pence(price.amount_pence,current_date)
    into v_plan,v_price,v_amount
  from public.membership_plans plan join public.membership_plan_prices price on price.plan_id=plan.id
  where plan.slug='adult' and price.membership_year=public.membership_billing_year(current_date) and price.active;
  insert into public.membership_applications(
    requested_plan_id,full_name,contact_email,date_of_birth,payment_method,auto_renew,status,
    verification_token_hash,verification_expires_at,email_verified_at,terms_version,terms_accepted_at
  ) values(v_plan,'Synthetic Paid Member','membership-member-'||v_portal||'@example.invalid','1980-01-01','cash',false,'awaiting_cash',
    repeat('a',64),now()+interval '1 day',now(),'test',now()) returning id into v_application;

  select member_id,term_id,payment_id into v_member,v_term,v_payment
  from public.activate_membership_application(v_application,v_price,'cash',v_amount,v_actor,'Synthetic receipt and audit reason');
  update public.members set auth_user_id=v_portal where id=v_member;
  if (select status from public.membership_payments where id=v_payment)<>'paid'
    or (select effective_state from public.members where id=v_member)<>'active' then
    raise exception 'cash activation failed';
  end if;

  select public.grant_lifetime_honorary_membership(v_member,current_date,'Lifetime service to the Society.',v_actor) into v_honorary;
  if (select count(*) from public.membership_payments where term_id=v_term)<>1
    or (select effective_state from public.members where id=v_member)<>'honorary' then
    raise exception 'honorary grant created payment or failed entitlement activation';
  end if;
  perform public.run_membership_daily(make_date(extract(year from current_date)::integer+1,3,1));
  if (select effective_state from public.members where id=v_member)<>'honorary' then
    raise exception 'lapse automation changed active honorary member';
  end if;

  begin
    perform public.revoke_lifetime_honorary_membership(v_honorary,current_date,v_plan,'',v_actor);
    raise exception 'missing revocation reason was accepted';
  exception when others then
    if sqlerrm not like '%honorary_membership_revocation_invalid%' then raise; end if;
  end;
  update public.users set membership_status='suspended' where id=v_portal;
  if (select effective_state from public.members where id=v_member)<>'suspended' then
    raise exception 'disciplinary suspension did not override honorary entitlement';
  end if;
  update public.users set membership_status='active' where id=v_portal;
  if (select effective_state from public.members where id=v_member)<>'honorary' then
    raise exception 'restoration did not reinstate the active honorary entitlement';
  end if;

  if has_table_privilege('authenticated','public.membership_payments','SELECT')
    or has_function_privilege('authenticated','public.activate_membership_application(uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz)','EXECUTE') then
    raise exception 'membership financial privileges are unsafe';
  end if;
end;
$test$;
rollback;`;
  const result = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ROLLBACK/);
});
