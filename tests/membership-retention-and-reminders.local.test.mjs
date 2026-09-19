
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

test("retention: nothing happens until switched on, then a warning, then anonymising a month later", () => {
  runRolledBack("Retention database test", String.raw`
do $test$
declare
  adult uuid; price uuid; a_user uuid:=gen_random_uuid(); d_user uuid:=gen_random_uuid();
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid;
  r jsonb; row_a record; notice uuid; a_terms uuid;
begin
  select id into adult from public.membership_plans where slug='adult';
  select id into price from public.membership_plan_prices where plan_id=adult limit 1;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (a_user,'authenticated','authenticated','ret-a-'||a_user||'@example.invalid',now(),'{"full_name":"Retention A"}',now(),now()),
   (d_user,'authenticated','authenticated','ret-d-'||d_user||'@example.invalid',now(),'{"full_name":"Retention D"}',now(),now());
  update public.user_roles set role='administrator' where user_id=d_user;

  -- A: lapsed, last paid 2023, has an email and a website login.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,auth_user_id,contact_number)
   values('Retention A','ret-a@example.test',adult,'lapsed','officer',a_user,'01234 567890') returning id into a;
  -- B: lapsed, last paid 2023, no contact details at all.
  insert into public.members(full_name,current_plan_id,effective_state,source) values('Retention B',adult,'lapsed','officer') returning id into b;
  -- C: as A but on legal hold.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,legal_hold) values('Retention C','ret-c@example.test',adult,'lapsed','officer',true) returning id into c;
  -- D: an administrator's own membership.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,auth_user_id) values('Retention D','ret-d@example.test',adult,'lapsed','officer',d_user) returning id into d;
  -- E: lapsed but paid for 2025, so nowhere near due.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Retention E','ret-e@example.test',adult,'lapsed','officer') returning id into e;
  -- F: never paid, created in mid-2022.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,created_at) values('Retention F','ret-f@example.test',adult,'lapsed','officer','2022-06-01') returning id into f;

  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   select m.id,price,y.year,make_date(y.year,1,1),make_date(y.year,12,31),make_date(y.year+1,3,1),'paid',2000,2000,'officer'
   from (values (a,2023),(b,2023),(c,2023),(d,2023),(e,2025)) as y(id,year) join public.members m on m.id=y.id;
  select id into a_terms from public.membership_terms where member_id=a;
  insert into public.membership_payments(term_id,method,status,amount_pence,stripe_checkout_session_id,stripe_payment_intent_id,notes)
   values(a_terms,'stripe','paid',2000,'cs_ret_'||a,'pi_ret_'||a,'Paid by Retention A on the phone');

  -- The preview list, a fortnight before A's date (31 Dec 2024).
  select * into row_a from public.membership_retention_candidates(date '2024-12-15') where member_id=a;
  if row_a.retain_until<>date '2024-12-31' or row_a.basis<>'last_paid_year' or row_a.last_paid_year<>2023 or row_a.action<>'warn' then
    raise exception 'A should be waiting for a warning: %',row_a;
  end if;
  if (select action from public.membership_retention_candidates(date '2024-12-15') where member_id=b)<>'upcoming' then raise exception 'B has no contact details and is not due yet'; end if;
  if (select blocked_reason from public.membership_retention_candidates(date '2024-12-15') where member_id=c)<>'Legal hold' then raise exception 'legal hold not shown'; end if;
  if (select blocked_reason from public.membership_retention_candidates(date '2024-12-15') where member_id=d)<>'Has an officer or committee role' then raise exception 'officer not shown'; end if;
  if exists(select 1 from public.membership_retention_candidates(date '2024-12-15') where member_id=e) then raise exception 'a member paid up to 2025 is on the list'; end if;
  if (select basis from public.membership_retention_candidates(date '2024-12-15') where member_id=f)<>'created' then raise exception 'never-paid member not based on creation date'; end if;

  -- Switched off: it only counts.
  r:=public.run_membership_retention(date '2024-12-15');
  if (r->>'enabled')::boolean then raise exception 'ran while switched off'; end if;
  if exists(select 1 from public.membership_notifications where kind='membership.retention-warning' and member_id in (a,b,c,d,f)) then raise exception 'warned while switched off'; end if;

  -- Switched on: warnings go out, once.
  update public.membership_retention_settings set enabled=true where singleton;
  r:=public.run_membership_retention(date '2024-12-15');
  if (r->>'warned')::integer<2 then raise exception 'expected warnings for A and F, got %',r; end if;
  select id into notice from public.membership_notifications where member_id=a and kind='membership.retention-warning';
  if notice is null then raise exception 'A was not warned'; end if;
  if (select body from public.membership_notifications where id=notice) not like '%31 December 2024%' then raise exception 'warning does not give the date'; end if;
  if (select recipient_email from public.membership_notifications where id=notice)<>'ret-a@example.test' then raise exception 'warning not addressed to A'; end if;
  perform public.run_membership_retention(date '2024-12-16');
  if (select count(*) from public.membership_notifications where member_id=a and kind='membership.retention-warning')<>1 then raise exception 'A was warned twice'; end if;
  if (select action from public.membership_retention_candidates(date '2025-01-02') where member_id=a)<>'waiting' then raise exception 'A should still be waiting for the notice period'; end if;

  -- Nothing is anonymised before the notice period has passed, apart from people who could never be warned.
  r:=public.run_membership_retention(date '2025-01-02');
  if (select anonymized_at from public.members where id=a) is not null then raise exception 'A anonymised too early'; end if;
  if (select anonymized_at from public.members where id=b) is null then raise exception 'B, who cannot be warned, was not anonymised'; end if;
  if (select anonymized_at from public.members where id=c) is not null or (select anonymized_at from public.members where id=d) is not null then raise exception 'a blocked member was anonymised'; end if;

  -- A month after the warning.
  update public.membership_notifications set created_at=timestamptz '2024-12-01' where id=notice;
  if (select action from public.membership_retention_candidates(date '2025-01-02') where member_id=a)<>'anonymise' then raise exception 'A should be ready'; end if;
  r:=public.run_membership_retention(date '2025-01-02');
  if (r->>'anonymised')::integer<1 then raise exception 'nothing anonymised: %',r; end if;

  if (select full_name from public.members where id=a) not like 'Former member · %' or (select contact_email from public.members where id=a) is not null
    or (select contact_number from public.members where id=a) is not null or (select auth_user_id from public.members where id=a) is not null
    or (select effective_state from public.members where id=a)<>'archived' then raise exception 'A was not anonymised properly'; end if;
  if (select membership_status from public.users where id=a_user)<>'archived' or (select retention_until from public.users where id=a_user)>=now() then
    raise exception 'A''s website login is not queued for deletion';
  end if;
  if (select recipient_email from public.membership_notifications where id=notice) is not null or (select body from public.membership_notifications where id=notice) like '%Retention A%' then
    raise exception 'the warning email still holds A''s details';
  end if;
  if (select amount_pence from public.membership_payments where term_id=a_terms)<>2000 or (select notes from public.membership_payments where term_id=a_terms) is not null then
    raise exception 'payment should keep its amount and lose its note';
  end if;
  if not exists(select 1 from public.audit_logs where action='membership.retention-anonymised' and entity_id=a::text) then raise exception 'no audit entry'; end if;
  if exists(select 1 from public.audit_logs where action='membership.retention-anonymised' and summary ilike '%Retention A%') then raise exception 'audit entry holds a name'; end if;
  if (select anonymized_at from public.members where id=c) is not null or (select anonymized_at from public.members where id=d) is not null then raise exception 'a blocked member was anonymised later'; end if;
  if has_function_privilege('authenticated','public.run_membership_retention(date)','execute') or has_function_privilege('authenticated','public.anonymise_membership_member(uuid)','execute') then
    raise exception 'signed-in users can run retention';
  end if;
end $test$;`);
});

test("renewal reminders go out on the four fixed dates, only to invited members who have not paid", () => {
  runRolledBack("Renewal reminder schedule database test", String.raw`
do $test$
declare
  adult uuid; actor uuid:=gen_random_uuid(); m1 uuid; m2 uuid; m3 uuid; m4 uuid; r jsonb; y integer:=2031; queued integer;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
   values(actor,'authenticated','authenticated','reminder-officer-'||actor||'@example.invalid',now(),'{"full_name":"Reminder Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=actor;
  insert into public.membership_plan_prices(plan_id,membership_year,version,amount_pence,active)
   select adult,y,coalesce(max(version),0)+1,2500,true from public.membership_plan_prices where plan_id=adult and membership_year=y;
  insert into public.membership_renewal_campaigns(membership_year,open,opened_by) values(y,true,actor);

  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Reminder One','r1@example.test',adult,'active','officer') returning id into m1;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Reminder Two paid','r2@example.test',adult,'active','officer') returning id into m2;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Reminder Three lapsed','r3@example.test',adult,'lapsed','officer') returning id into m3;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Reminder Four uninvited','r4@example.test',adult,'active','officer') returning id into m4;

  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   values(m2,(select id from public.membership_plan_prices where plan_id=adult and membership_year=y and active limit 1),y,make_date(y,1,1),make_date(y,12,31),make_date(y+1,3,1),'paid',2500,2500,'officer');
  insert into public.membership_renewal_invitations(member_id,membership_year,token_hash,expires_at)
   select id,y,md5(id::text)||md5(id::text),make_date(y,12,31) from public.members where id in (m1,m2,m3);
  insert into public.membership_notifications(member_id,recipient_email,kind,title,body,action_href,portal_visible,deduplication_key)
   select id,contact_email,'membership.renewal-invitation','Renew','Please renew','/membership/renew?token=abc',false,'renewal-invitation-'||id||'-'||y
   from public.members where id in (m1,m2,m3);

  r:=public.run_membership_renewal_reminder_schedule(make_date(y-1,12,1));
  if r->>'stage'<>'due-soon' or (r->>'year')::integer<>y or (r->>'queued')::integer<>1 then raise exception 'December reminder: %',r; end if;
  if not exists(select 1 from public.membership_notifications where member_id=m1 and kind='membership.renewal-reminder' and title like '%due on 1 January%' and body like '%1 January 2031%') then raise exception 'M1 was not reminded'; end if;
  if exists(select 1 from public.membership_notifications where member_id in (m2,m3,m4) and kind='membership.renewal-reminder') then raise exception 'a paid, lapsed or uninvited member was reminded'; end if;
  r:=public.run_membership_renewal_reminder_schedule(make_date(y-1,12,1));
  if (r->>'queued')::integer<>0 then raise exception 'the same day queued twice'; end if;

  r:=public.run_membership_renewal_reminder_schedule(make_date(y,1,1));
  if r->>'stage'<>'due-now' or (r->>'queued')::integer<>1 then raise exception 'January reminder: %',r; end if;
  r:=public.run_membership_renewal_reminder_schedule(make_date(y,2,1));
  if r->>'stage'<>'one-month' or (r->>'queued')::integer<>1 then raise exception 'February reminder: %',r; end if;
  r:=public.run_membership_renewal_reminder_schedule(make_date(y,2,22));
  if r->>'stage'<>'last-week' or (r->>'queued')::integer<>1 then raise exception 'late February reminder: %',r; end if;
  if (select count(*) from public.membership_notifications where member_id=m1 and kind='membership.renewal-reminder')<>4 then raise exception 'M1 should have four reminders'; end if;

  if public.run_membership_renewal_reminder_schedule(make_date(y,2,10)) is not null then raise exception 'reminder on an ordinary day'; end if;
  r:=public.run_membership_renewal_reminder_schedule(make_date(y,12,1));
  if (r->>'campaign_open')::boolean then raise exception 'no campaign was open for the next year'; end if;
  r:=public.run_membership_renewal_reminder_schedule(date '2025-12-01');
  if r->>'skipped'<>'too-late' then raise exception 'an old day was replayed: %',r; end if;

  -- A member who pays stops being reminded.
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   values(m1,(select id from public.membership_plan_prices where plan_id=adult and membership_year=y and active limit 1),y,make_date(y,1,1),make_date(y,12,31),make_date(y+1,3,1),'paid',2500,2500,'officer');
  update public.membership_notifications set created_at=created_at-interval '30 days' where member_id=m1 and kind='membership.renewal-reminder';
  r:=public.run_membership_renewal_reminder_schedule(make_date(y,2,22));
  if (r->>'queued')::integer<>0 then raise exception 'a paid member was reminded'; end if;

  -- The officer's own button still works, and still keeps to one reminder a week.
  queued:=public.queue_membership_renewal_reminders(y,actor);
  if queued<>1 or exists(select 1 from public.membership_notifications where member_id=m1 and kind='membership.renewal-reminder' and created_at>now()-interval '1 day') then
    raise exception 'manual reminders should reach only the lapsed member who has not paid: %',queued;
  end if;
  if public.queue_membership_renewal_reminders(y,actor)<>0 then raise exception 'the weekly limit did not hold'; end if;

  -- The daily job runs both, and records what the reminders and retention did.
  r:=public.run_membership_daily_catch_up(current_date);
  if not (r ? 'retention') or not (r ? 'days_run') then raise exception 'daily job result: %',r; end if;
end $test$;`);
});

test("the website's server role can read what the Old records page and the Inbox need, and signed-in users cannot", () => {
  runRolledBack("Server role access database test", String.raw`
do $test$
begin
  set local role service_role;
  perform 1 from public.membership_retention_settings;
  perform 1 from public.membership_daily_runs;
  perform count(*) from public.membership_retention_candidates(current_date, 62);
  update public.membership_retention_settings set enabled=enabled where singleton;
  reset role;
  set local role authenticated;
  begin
    perform 1 from public.membership_retention_settings;
    raise exception 'signed-in users can read the retention switch';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $test$;`);
});
