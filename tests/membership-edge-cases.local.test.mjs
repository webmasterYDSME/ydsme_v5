import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("enforces membership lifecycle, eligibility, versioning, and duplicate edge cases locally", (t) => {
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
  v_actor uuid:=gen_random_uuid();
  v_adult uuid;
  v_student uuid;
  v_junior uuid;
  v_current_price uuid;
  v_next_price uuid;
  v_current_year integer:=extract(year from current_date)::integer;
  v_next_year integer:=extract(year from current_date)::integer+1;
  v_member uuid;
  v_term uuid;
  v_payment uuid;
  v_duplicate uuid;
  v_application uuid;
  v_honorary uuid;
  v_online_honorary_member uuid;
  v_offline_honorary_member uuid;
  v_transition_honorary uuid;
  v_amount integer;
  v_settings_one uuid;
  v_settings_two uuid;
  v_portal_user uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_actor,'authenticated','authenticated','edge-officer-'||v_actor||'@example.invalid',now(),'{"full_name":"Edge Membership Administrator"}',now(),now());
  update public.user_roles set role='administrator' where user_id=v_actor;
  select id into v_adult from public.membership_plans where slug='adult';
  select id into v_student from public.membership_plans where slug='student';
  select id into v_junior from public.membership_plans where slug='junior';
  select id into v_current_price from public.membership_plan_prices
    where plan_id=v_adult and membership_year=v_current_year and active;
  select id into v_next_price from public.membership_plan_prices
    where plan_id=v_adult and membership_year=v_next_year and active;

  select member_id,term_id,payment_id into v_member,v_term,v_payment
  from public.create_officer_managed_membership(
    p_plan_id=>v_adult,p_full_name=>'Synthetic Lifecycle Member',p_date_of_birth=>'1980-01-01',
    p_payment_method=>'cash',p_payment_received=>true,p_payment_reference=>'EDGE-CASH-1',
    p_received_on=>current_date,p_actor_id=>v_actor,p_contact_number=>'01904 000100'
  );
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values(v_portal_user,'authenticated','authenticated','edge-member-'||v_portal_user||'@example.invalid',now(),
    '{"full_name":"Synthetic Portal Member"}',now(),now());
  update public.members set contact_email='edge-member-'||v_portal_user||'@example.invalid',auth_user_id=v_portal_user
    where id=v_member;
  if not exists(
    select 1 from public.membership_notifications notification
    where notification.member_id=v_member and notification.kind='membership.activated'
      and notification.recipient_user_id=v_portal_user and notification.portal_visible
  ) then raise exception 'Paid officer membership activation was not linked to the portal'; end if;
  update public.users set membership_status='archived',retention_until=now()+interval '12 months',legal_hold=true
    where id=v_portal_user;
  if not exists(select 1 from public.members where id=v_member and effective_state='archived'
      and retention_until is not null and legal_hold) then
    raise exception 'Portal archival did not preserve the canonical retention and legal-hold decision';
  end if;
  update public.users set membership_status='active',retention_until=null,legal_hold=false where id=v_portal_user;
  if not exists(select 1 from public.members where id=v_member and effective_state='active'
      and retention_until is null and not legal_hold) then
    raise exception 'Portal restoration did not restore the canonical membership retention state';
  end if;
  begin
    perform public.create_officer_managed_membership(
      p_plan_id=>v_adult,p_full_name=>'Synthetic Lifecycle Member',p_date_of_birth=>'1980-01-01',
      p_payment_method=>'cash',p_payment_received=>false,p_payment_reference=>null,
      p_received_on=>current_date,p_actor_id=>v_actor
    );
    raise exception 'Duplicate officer membership was accepted without an override';
  exception when others then
    if sqlerrm not like '%membership_possible_duplicate%' then raise; end if;
  end;
  select member_id into v_duplicate from public.create_officer_managed_membership(
    p_plan_id=>v_adult,p_full_name=>'Synthetic Lifecycle Member',p_date_of_birth=>'1980-01-01',
    p_payment_method=>'cash',p_payment_received=>false,p_payment_reference=>null,
    p_received_on=>current_date,p_actor_id=>v_actor,p_duplicate_override_reason=>'Confirmed separate person after an identity review.'
  );
  if v_duplicate is null then raise exception 'Audited duplicate override did not create the member'; end if;

  begin
    perform public.create_officer_managed_membership(
      p_plan_id=>v_student,p_full_name=>'Synthetic Undeclared Student',p_date_of_birth=>'2004-01-01',
      p_payment_method=>'cash',p_payment_received=>false,p_payment_reference=>null,
      p_received_on=>current_date,p_actor_id=>v_actor,p_student_declaration=>false
    );
    raise exception 'Student membership was accepted without a declaration';
  exception when others then
    if sqlerrm not like '%membership_student_declaration_required%' then raise; end if;
  end;
  begin
    perform public.create_officer_managed_membership(
      p_plan_id=>v_junior,p_full_name=>'Synthetic Junior Without Consent',p_date_of_birth=>'2010-01-01',
      p_payment_method=>'cash',p_payment_received=>false,p_payment_reference=>null,
      p_received_on=>current_date,p_actor_id=>v_actor,p_guardian_name=>'Synthetic Guardian'
    );
    raise exception 'Junior membership was accepted without recorded guardian consent';
  exception when others then
    if sqlerrm not like '%membership_guardian_consent_required%' then raise; end if;
  end;

  insert into public.membership_applications(
    requested_plan_id,full_name,contact_email,date_of_birth,guardian_name,guardian_email,guardian_consent,
    payment_method,auto_renew,status,verification_token_hash,verification_expires_at,email_verified_at,
    guardian_verification_token_hash,guardian_verification_expires_at,terms_version,terms_accepted_at
  ) values(
    v_junior,'Synthetic Expired Guardian','expired-guardian@example.invalid','2010-01-01',
    'Synthetic Guardian','guardian@example.invalid',true,'cheque',false,'guardian_verification_pending',
    repeat('b',64),now()+interval '1 day',now(),repeat('c',64),now()-interval '1 minute','test',now()
  ) returning id into v_application;
  perform public.expire_membership_applications();
  if (select status from public.membership_applications where id=v_application)<>'expired' then
    raise exception 'Expired guardian consent did not expire the application';
  end if;

  select public.replace_membership_payment_settings(
    v_actor,'Edge Treasurer','edge-treasurer@example.invalid',null,'Edge Society Account','00-11-22','12345678',
    'Use the supplied edge-test membership reference.','Edge Society','Deliver the edge-test cheque to the Treasurer.',
    'Arrange the complete edge-test cash payment with an officer.'
  ) into v_settings_one;
  select public.replace_membership_payment_settings(
    v_actor,'Edge Treasurer Two','edge-treasurer-two@example.invalid',null,'Edge Society Account Two','00-11-23','12345679',
    'Use the second supplied edge-test membership reference.','Edge Society Two','Deliver the second edge-test cheque to the Treasurer.',
    'Arrange the second complete edge-test cash payment with an officer.'
  ) into v_settings_two;
  if (select count(*) from public.membership_payment_settings_versions where active)<>1
    or not (select active from public.membership_payment_settings_versions where id=v_settings_two)
    or (select active from public.membership_payment_settings_versions where id=v_settings_one) then
    raise exception 'Versioned payment settings did not retain exactly one active version';
  end if;

  insert into public.members(full_name,current_plan_id,effective_state,source)
  values('Synthetic Online Honorary Transition',v_adult,'active','officer')
  returning id into v_online_honorary_member;
  select public.grant_lifetime_honorary_membership(
    v_online_honorary_member,current_date,'Online renewal transition test.',v_actor
  ) into v_transition_honorary;
  perform public.revoke_lifetime_honorary_membership(
    v_transition_honorary,make_date(v_next_year,1,1),v_adult,'Returning to paid membership.',v_actor
  );
  select amount_pence into v_amount from public.membership_plan_prices where id=v_next_price;
  perform public.activate_membership_renewal(
    p_member_id=>v_online_honorary_member,p_plan_price_id=>v_next_price,p_membership_year=>v_next_year,
    p_method=>'stripe',p_amount_pence=>v_amount,p_paid_on=>current_date,
    p_stripe_checkout_session_id=>'cs_test_honorary_transition_online',
    p_stripe_payment_intent_id=>'pi_honorarytransitiononline',
    p_stripe_invoice_id=>'in_honorarytransitiononline',p_stripe_customer_id=>'cus_honorarytransitiononline',
    p_stripe_subscription_id=>'sub_honorarytransitiononline',p_stripe_subscription_status=>'active'
  );
  if not exists(select 1 from public.membership_terms where member_id=v_online_honorary_member
      and membership_year=v_next_year and status='paid') then
    raise exception 'Online honorary transition prepayment did not create the paid term';
  end if;

  insert into public.members(full_name,current_plan_id,effective_state,source)
  values('Synthetic Offline Honorary Transition',v_adult,'active','officer')
  returning id into v_offline_honorary_member;
  select public.grant_lifetime_honorary_membership(
    v_offline_honorary_member,current_date,'Offline renewal transition test.',v_actor
  ) into v_transition_honorary;
  perform public.revoke_lifetime_honorary_membership(
    v_transition_honorary,make_date(v_next_year,1,1),v_adult,'Returning to paid membership.',v_actor
  );
  perform public.activate_offline_membership_renewal(
    v_offline_honorary_member,v_next_price,v_next_year,'bank_transfer',v_amount,current_date,
    'EDGE-HONORARY-TRANSITION',v_actor
  );
  if not exists(select 1 from public.membership_terms where member_id=v_offline_honorary_member
      and membership_year=v_next_year and status='paid') then
    raise exception 'Offline honorary transition prepayment did not create the paid term';
  end if;

  perform public.run_membership_daily(make_date(v_next_year,1,1));
  if (select effective_state from public.members where id=v_member)<>'grace' then
    raise exception 'Unpaid January renewal did not enter grace';
  end if;
  perform public.run_membership_daily(make_date(v_next_year,2,28));
  if (select effective_state from public.members where id=v_member)<>'grace' then
    raise exception 'Membership lapsed before the end of February';
  end if;
  perform public.run_membership_daily(make_date(v_next_year,3,1));
  if (select effective_state from public.members where id=v_member)<>'lapsed' then
    raise exception 'Membership did not lapse on 1 March';
  end if;
  select amount_pence into v_amount from public.membership_plan_prices where id=v_next_price;
  begin
    perform public.activate_offline_membership_renewal(
      v_member,v_next_price,v_next_year,'bank_transfer',v_amount,make_date(v_next_year,3,1),'EDGE-FUTURE-RECEIPT',v_actor
    );
    raise exception 'A future receipt date was accepted';
  exception when others then
    if sqlerrm not like '%membership_offline_renewal_invalid%' then raise; end if;
  end;

  select public.grant_lifetime_honorary_membership(
    v_member,make_date(v_next_year+1,1,1),'Exceptional long-term service.',v_actor
  ) into v_honorary;
  if (select count(*) from public.membership_payments where term_id=v_term)<>1
    or (select status from public.honorary_memberships where id=v_honorary)<>'scheduled' then
    raise exception 'Scheduled honorary status changed immutable payment history';
  end if;
end;
$test$;
rollback;`;
  const result = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ROLLBACK/);
});
