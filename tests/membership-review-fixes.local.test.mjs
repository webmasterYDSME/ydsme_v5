import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

/** Runs a block of SQL inside a transaction that is always rolled back, so nothing is left in the local database. */
function runRolledBack(purpose, body) {
  readLocalSupabaseEnvironment(purpose);
  const sql = `begin;\n${body}\nrollback;`;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_ydsme_v5", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("website access follows the membership record for everyone, and never reopens a suspended account", () => {
  runRolledBack("Access sync database test", String.raw`
do $test$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  ma uuid; mb uuid; adult uuid;
  function_status text;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (a,'authenticated','authenticated','sync-member-'||a||'@example.invalid',now(),'{"full_name":"Sync Member"}',now(),now()),
   (b,'authenticated','authenticated','sync-admin-'||b||'@example.invalid',now(),'{"full_name":"Sync Admin"}',now(),now());
  update public.user_roles set role='administrator' where user_id=b;
  select id into adult from public.membership_plans where slug='adult';
  insert into public.members(full_name,current_plan_id,effective_state,source,auth_user_id) values('Sync Member',adult,'active','officer',a) returning id into ma;
  insert into public.members(full_name,current_plan_id,effective_state,source,auth_user_id) values('Sync Admin',adult,'active','officer',b) returning id into mb;

  -- Both have paid for this year, so a restored account is not put straight back to lapsed by the older reverse trigger.
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   select m.id,(select id from public.membership_plan_prices where plan_id=adult and membership_year=extract(year from current_date)::integer and active limit 1),
     extract(year from current_date)::integer,make_date(extract(year from current_date)::integer,1,1),make_date(extract(year from current_date)::integer,12,31),make_date(extract(year from current_date)::integer+1,3,1),
     'paid',2000,2000,'officer' from public.members m where m.id in (ma,mb);
  update public.members set effective_state='lapsed' where id in (ma,mb);
  if (select membership_status from public.users where id=a)<>'lapsed' then raise exception 'lapsed member kept access'; end if;
  if (select membership_status from public.users where id=b)<>'lapsed' then raise exception 'administrator was exempt from lapsing'; end if;

  update public.members set effective_state='active' where id in (ma,mb);
  if (select membership_status from public.users where id=a)<>'active' or (select membership_status from public.users where id=b)<>'active' then
    raise exception 'renewal did not restore access';
  end if;

  update public.members set auth_user_id=null where id=ma;
  if (select membership_status from public.users where id=a)<>'suspended' then raise exception 'removed login kept members area access'; end if;
  update public.members set auth_user_id=null where id=mb;
  if (select membership_status from public.users where id=b)<>'active' then raise exception 'officer login was switched off by removing a member link'; end if;

  update public.members set auth_user_id=a, effective_state='active' where id=ma;
  if (select membership_status from public.users where id=a)<>'suspended' then raise exception 'a suspended account was reopened by linking'; end if;
end $test$;`);
});

test("a card payment the database refuses is recorded once for an officer", () => {
  runRolledBack("Unapplied payment database test", String.raw`
do $test$
declare p uuid; price uuid; app uuid; session text:='cs_unapplied_'||replace(gen_random_uuid()::text,'-',''); year integer:=extract(year from now())::integer;
begin
  select id into p from public.membership_plans where slug='adult';
  insert into public.membership_plan_prices(plan_id,membership_year,version,amount_pence,active)
   values(p,year,(select coalesce(max(version),0)+1 from public.membership_plan_prices where plan_id=p and membership_year=year),6000,false) returning id into price;
  insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,auto_renew,email_verified_at,verification_token_hash,verification_expires_at,expires_at,terms_version,terms_accepted_at)
   values(p,'Unapplied test',session||'@example.test','1980-01-01','stripe','awaiting_payment',false,now(),md5(session)||md5(session),now()+interval '7 days',now()+interval '30 days','test',now()) returning id into app;
  insert into public.membership_checkout_attempts(purpose,application_id,membership_year,plan_price_id,amount_pence,auto_renew,status,stripe_checkout_session_id,expires_at)
   values('application',app,year,price,1000,false,'open',session,now()+interval '1 hour');
  if not public.record_unapplied_membership_payment(session,'pi_unapplied','membership_renewal_already_paid') then raise exception 'payment not recorded'; end if;
  if not exists(select 1 from public.membership_checkout_attempts where stripe_checkout_session_id=session and status='payment_review'
      and last_error='unapplied:membership_renewal_already_paid' and stripe_payment_intent_id='pi_unapplied' and resolved_at is null) then
    raise exception 'attempt was not marked for review';
  end if;
  if not exists(select 1 from public.audit_logs where action='membership.payment-not-applied' and after_state->>'stripe_checkout_session_id'=session) then raise exception 'no audit entry'; end if;
  if public.record_unapplied_membership_payment('cs_does_not_exist','pi_x','x') then raise exception 'unknown session reported as recorded'; end if;
  if has_function_privilege('authenticated','public.record_unapplied_membership_payment(text,text,text)','execute') then raise exception 'signed-in users can record payments'; end if;
end $test$;`);
});

test("the daily job catches up on a missed 1 March and a cheque received keeps an application open", () => {
  runRolledBack("Daily catch-up database test", String.raw`
do $test$
declare
  adult uuid; m uuid; actor uuid:=gen_random_uuid(); actor_row uuid; app_kept uuid; app_expired uuid; session text:=replace(gen_random_uuid()::text,'-','');
  result jsonb; y integer:=2031;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into public.members(full_name,current_plan_id,effective_state,source) values('Catch-up member',adult,'grace','officer') returning id into m;
  insert into public.membership_daily_runs(run_date) values(make_date(y,2,27));
  result:=public.run_membership_daily_catch_up(make_date(y,3,2));
  if (result->>'days_run')::integer<>3 then raise exception 'expected 3 days to run, got %',result->>'days_run'; end if;
  if (select count(*) from public.membership_daily_runs where run_date between make_date(y,2,27) and make_date(y,3,2))<>4 then raise exception 'days were not recorded'; end if;
  if (select effective_state from public.members where id=m)<>'lapsed' then raise exception 'a missed 1 March did not lapse the member'; end if;
  result:=public.run_membership_daily_catch_up(make_date(y,3,2));
  if (result->>'days_run')::integer<>1 then raise exception 'a second run on the same day should only run that day'; end if;

  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
   values(actor,'authenticated','authenticated','expiry-officer-'||actor||'@example.invalid',now(),'{"full_name":"Expiry Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=actor;
  actor_row:=public.ensure_administrative_actor(actor);
  insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,auto_renew,email_verified_at,verification_token_hash,verification_expires_at,expires_at,terms_version,terms_accepted_at)
   values(adult,'Cheque received','kept-'||session||'@example.test','1980-01-01','cheque','awaiting_cheque',false,now(),md5('k'||session)||md5('k'||session),now()-interval '2 days',now()-interval '1 day','test',now()) returning id into app_kept;
  insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,auto_renew,email_verified_at,verification_token_hash,verification_expires_at,expires_at,terms_version,terms_accepted_at)
   values(adult,'Nothing received','gone-'||session||'@example.test','1980-01-01','cheque','awaiting_cheque',false,now(),md5('g'||session)||md5('g'||session),now()-interval '2 days',now()-interval '1 day','test',now()) returning id into app_expired;
  insert into public.membership_offline_payment_records(application_id,method,status,expected_amount_pence,payment_reference,received_on,recorded_by_actor_id)
   values(app_kept,'cheque','received',3000,'CHQ-KEPT',current_date,actor_row);
  perform public.expire_membership_applications();
  if (select status from public.membership_applications where id=app_kept)<>'awaiting_cheque' then raise exception 'a received cheque was expired'; end if;
  if (select status from public.membership_applications where id=app_expired)<>'expired' then raise exception 'an unpaid overdue application was not expired'; end if;
end $test$;`);
});

test("only money actually taken is owed back, and a Junior's guardian is copied on the renewal invitation", () => {
  runRolledBack("Refund and guardian copy database test", String.raw`
do $test$
declare
  actor uuid:=gen_random_uuid(); junior uuid; adult uuid; m uuid; t uuid; owed integer; year integer:=extract(year from now())::integer; app uuid; session text:=replace(gen_random_uuid()::text,'-','');
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
   values(actor,'authenticated','authenticated','refund-officer-'||actor||'@example.invalid',now(),'{"full_name":"Refund Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=actor;
  select id into adult from public.membership_plans where slug='adult';
  select id into junior from public.membership_plans where slug='junior';

  insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,auto_renew,email_verified_at,verification_token_hash,verification_expires_at,expires_at,terms_version,terms_accepted_at,manual_verification)
   values(adult,'Refund test','refund-'||session||'@example.test','1980-01-01','stripe','converted',false,now(),md5('r'||session)||md5('r'||session),now()+interval '7 days',now()+interval '30 days','test',now(),'denied') returning id into app;
  insert into public.members(full_name,current_plan_id,effective_state,source) values('Refund test',adult,'active','officer') returning id into m;
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source,application_id)
   values(m,(select id from public.membership_plan_prices where plan_id=adult and membership_year=year and active limit 1),year,make_date(year,1,1),make_date(year,12,31),make_date(year+1,3,1),'paid',2000,2000,'application',app) returning id into t;
  insert into public.membership_payments(term_id,method,status,amount_pence,stripe_checkout_session_id,stripe_payment_intent_id) values
   (t,'stripe','paid',2000,'cs_paid_'||session,'pi_paid_'||session),(t,'stripe','failed',2000,'cs_failed_'||session,'pi_failed_'||session),(t,'stripe','void',2000,'cs_void_'||session,'pi_void_'||session);
  owed:=public.record_denied_membership_refund(app,actor,'Handed the cash back.');
  if owed<>2000 then raise exception 'expected 2000 owed, got %',owed; end if;
  if (select count(*) from public.membership_payments where term_id=t and status in ('failed','void') and refunded_pence=0)<>2 then raise exception 'failed or cancelled payments were written off as refunded'; end if;

  insert into public.members(full_name,current_plan_id,effective_state,source,date_of_birth,guardian_name,guardian_email,contact_email)
   values('Junior copy',junior,'active','officer',current_date-interval '10 years','Guardian Person','guardian-'||session||'@example.test','junior-'||session||'@example.test') returning id into m;
  insert into public.membership_notifications(member_id,recipient_email,kind,title,body,deduplication_key)
   values(m,'junior-'||session||'@example.test','membership.renewal-invitation','Renew Junior copy','Renewals are open.','review-guardian-copy-'||session);
  if not exists(select 1 from public.membership_notifications where member_id=m and recipient_email='guardian-'||session||'@example.test' and kind='membership.renewal-invitation') then
    raise exception 'the guardian was not copied on the renewal invitation';
  end if;
end $test$;`);
});

test("paying the same renewal twice by card is refused with a code the webhook records for an officer", () => {
  runRolledBack("Duplicate renewal database test", String.raw`
do $test$
declare adult uuid; m uuid; price uuid; y integer:=extract(year from current_date)::integer+1; amount integer; s1 text:='cs_dup1_'||replace(gen_random_uuid()::text,'-',''); s2 text:='cs_dup2_'||replace(gen_random_uuid()::text,'-','');
begin
  select id into adult from public.membership_plans where slug='adult';
  select id,amount_pence into price,amount from public.membership_plan_prices where plan_id=adult and membership_year=y and active limit 1;
  if price is null then return; end if;
  insert into public.members(full_name,current_plan_id,effective_state,source) values('Double payer',adult,'active','officer') returning id into m;
  perform public.activate_membership_renewal(p_member_id=>m,p_plan_price_id=>price,p_membership_year=>y,p_method=>'stripe',p_amount_pence=>amount,p_paid_on=>current_date,
    p_stripe_checkout_session_id=>s1,p_stripe_payment_intent_id=>'pi_'||s1,p_stripe_customer_id=>'cus_dup');
  begin
    perform public.activate_membership_renewal(p_member_id=>m,p_plan_price_id=>price,p_membership_year=>y,p_method=>'stripe',p_amount_pence=>amount,p_paid_on=>current_date,
      p_stripe_checkout_session_id=>s2,p_stripe_payment_intent_id=>'pi_'||s2,p_stripe_customer_id=>'cus_dup');
    raise exception 'a second payment for the same year was accepted';
  exception when others then
    if sqlerrm<>'membership_renewal_already_paid' then raise; end if;
  end;
end $test$;`);
});
