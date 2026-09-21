import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

/** Runs a block of SQL inside a transaction that is always rolled back, so nothing is left in the local database. */
function runRolledBack(purpose, body) {
  readLocalSupabaseEnvironment(purpose);
  const sql = `begin;\nupdate public.membership_mode_settings set mode = 'membermojo', website_since = null where id;\n${body}\nrollback;`;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_ydsme_v5", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("membership mode: only an administrator can change it, every change is recorded, and a repeat changes nothing", () => {
  runRolledBack("Membership mode change test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  boss uuid := gen_random_uuid(); officer uuid := gen_random_uuid();
  r jsonb;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (boss,'authenticated','authenticated','mode-boss-'||tag||'@example.invalid',now(),'{"full_name":"Mode Boss"}',now(),now()),
   (officer,'authenticated','authenticated','mode-officer-'||tag||'@example.invalid',now(),'{"full_name":"Mode Committee"}',now(),now());
  update public.user_roles set role='administrator' where user_id=boss;
  update public.user_roles set role='committee' where user_id=officer;

  if public.membership_mode() <> 'membermojo' then raise exception 'the default must be membermojo'; end if;

  -- Committee members, members and strangers cannot change it.
  begin perform public.set_membership_mode(officer, 'website', 'Trying'); raise exception 'a committee login changed the mode';
  exception when others then if sqlerrm <> 'membership_mode_actor_invalid' then raise; end if; end;
  begin perform public.set_membership_mode(gen_random_uuid(), 'website', 'Trying'); raise exception 'unknown actor allowed';
  exception when others then if sqlerrm <> 'membership_mode_actor_invalid' then raise; end if; end;
  begin perform public.set_membership_mode(boss, 'pilot', 'Trying'); raise exception 'invalid mode allowed';
  exception when others then if sqlerrm <> 'membership_mode_invalid' then raise; end if; end;
  begin perform public.set_membership_mode(boss, 'website', '   '); raise exception 'blank reason allowed';
  exception when others then if sqlerrm <> 'membership_mode_reason_invalid' then raise; end if; end;
  if public.membership_mode() <> 'membermojo' then raise exception 'a refused change altered the mode'; end if;

  r := public.set_membership_mode(boss, 'website', 'Go live', '{"stripe":true}'::jsonb);
  if not (r->>'changed')::boolean or public.membership_mode() <> 'website' then raise exception 'the switch to website failed'; end if;
  if (select website_since from public.membership_mode_settings where id) is null then raise exception 'website_since not recorded'; end if;

  r := public.set_membership_mode(boss, 'website', 'Again');
  if (r->>'changed')::boolean then raise exception 'a repeat should change nothing'; end if;
  if (select count(*) from public.membership_mode_changes where changed_by = boss) <> 1 then raise exception 'a repeat was recorded'; end if;

  r := public.set_membership_mode(boss, 'membermojo', 'Emergency');
  if public.membership_mode() <> 'membermojo' then raise exception 'the switch back failed'; end if;
  if (select count(*) from public.membership_mode_changes where changed_by = boss) <> 2 then raise exception 'history not written'; end if;
  if (select count(*) from public.audit_logs where action = 'membership-mode.changed' and actor_user_id = boss) <> 2 then raise exception 'audit not written'; end if;
  if (select checks->>'stripe' from public.membership_mode_changes where to_mode = 'website' and changed_by = boss) <> 'true' then
    raise exception 'the readiness snapshot was not kept';
  end if;
end
$test$;
`);
});

test("membership mode: the server can change it only through the function, which works as the service role", () => {
  runRolledBack("Membership mode service role test", String.raw`
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-00000000a001','authenticated','authenticated','mode-service-boss@example.invalid',now(),'{"full_name":"Service Boss"}',now(),now());
update public.user_roles set role='administrator' where user_id='00000000-0000-0000-0000-00000000a001';
set local role service_role;
select public.set_membership_mode('00000000-0000-0000-0000-00000000a001', 'website', 'Through the service role', '[{"key":"payments","level":"ok"}]'::jsonb);
do $test$
begin
  if public.membership_mode() <> 'website' then raise exception 'the service role could not switch the mode'; end if;
  begin
    update public.membership_mode_settings set mode = 'membermojo' where id;
    raise exception 'the service role wrote to the settings table directly';
  exception when insufficient_privilege then null; end;
end
$test$;
select public.set_membership_mode('00000000-0000-0000-0000-00000000a001', 'membermojo', 'Back', null, true);
reset role;
do $test$
begin
  if public.membership_mode() <> 'membermojo' then raise exception 'the switch back failed'; end if;
  if (select count(*) from public.membership_mode_changes where changed_by = '00000000-0000-0000-0000-00000000a001') <> 2 then raise exception 'history not written'; end if;
end
$test$;
`);
});

test("membership mode: an import never archives while the website runs membership, and keeps website members after a switch back", () => {
  runRolledBack("Membership mode import guard test", String.raw`
do $test$
declare
  adult uuid; tag text := substr(md5(random()::text), 1, 8);
  boss uuid := gen_random_uuid(); before_member uuid; web_member uuid; web_paid uuid; term_price uuid;
  rows jsonb; m record; yr integer := extract(year from current_date)::integer;
begin
  select id into adult from public.membership_plans where slug='adult';
  select id into term_price from public.membership_plan_prices where plan_id=adult and active order by membership_year desc, version desc limit 1;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (boss,'authenticated','authenticated','guard-boss-'||tag||'@example.invalid',now(),'{"full_name":"Guard Boss"}',now(),now());
  update public.user_roles set role='administrator' where user_id=boss;

  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Before Website','before-'||tag||'@example.test',adult,'lapsed','membermojo_cutover') returning id into before_member;
  rows := jsonb_build_array(jsonb_build_object('full_name','Someone Else','email','else-'||tag||'@example.test','membership_type','Adult member'));

  -- MemberMojo runs membership: a missing member is archived.
  if (select decision from public.membermojo_import_removals(rows) where member_id = before_member) <> 'archive' then
    raise exception 'a missing member should be archived while MemberMojo runs membership';
  end if;

  -- The website runs membership: nobody is archived because they are missing from the list.
  perform public.set_membership_mode(boss, 'website', 'Go live');
  if exists (select 1 from public.membermojo_import_removals(rows) where decision = 'archive') then
    raise exception 'the import must not archive anyone while the website runs membership';
  end if;
  if (select decision from public.membermojo_import_removals(rows) where member_id = before_member) <> 'keep_website' then
    raise exception 'a missing member should be kept while the website runs membership';
  end if;

  -- People who join or renew on the website while it runs membership.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Website Joiner','joiner-'||tag||'@example.test',adult,'active','website') returning id into web_member;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Website Renewer','renewer-'||tag||'@example.test',adult,'active','membermojo_cutover') returning id into web_paid;
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   values(web_paid,term_price,yr,make_date(yr,1,1),make_date(yr,12,31),make_date(yr+1,3,1),'paid',2000,2000,'renewal');

  -- Back to MemberMojo: the website's people are kept, the others are archived as before.
  perform public.set_membership_mode(boss, 'membermojo', 'Emergency');
  for m in select * from public.membermojo_import_removals(rows) where member_id in (before_member, web_member, web_paid) loop
    if m.member_id = before_member and m.decision <> 'archive' then raise exception 'a pre-website member should be archived: %', m.decision; end if;
    if m.member_id in (web_member, web_paid) and m.decision <> 'keep_website' then raise exception 'a website member should be kept: %', m.decision; end if;
  end loop;
end
$test$;
`);
});

test("membership mode: switching back to MemberMojo can stop the queued membership emails", () => {
  runRolledBack("Membership mode queued email test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  boss uuid := gen_random_uuid(); r jsonb; queued integer;
begin
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (boss,'authenticated','authenticated','mail-boss-'||tag||'@example.invalid',now(),'{"full_name":"Mail Boss"}',now(),now());
  update public.user_roles set role='administrator' where user_id=boss;
  perform public.set_membership_mode(boss, 'website', 'Go live');
  queued := (select count(*) from public.membership_notifications
    where email_status in ('queued', 'failed') and recipient_email is not null);
  r := public.set_membership_mode(boss, 'membermojo', 'Emergency', null, true);
  if (r->>'stopped_emails')::integer < 0 or (select cancelled_emails from public.membership_mode_changes
      where to_mode = 'membermojo' and changed_by = boss) <> (r->>'stopped_emails')::integer then
    raise exception 'the number of stopped emails was not recorded';
  end if;
  if (select count(*) from public.membership_notifications
      where email_status = 'queued' and recipient_email is not null and delivery_class = 'bulk') <> 0 then
    raise exception 'queued bulk emails were not stopped';
  end if;
end
$test$;
`);
});
