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

test("MemberMojo list import: adds, renews, links, skips, and does it once", () => {
  runRolledBack("MemberMojo list import database test", String.raw`
do $test$
declare
  adult uuid; tag text := substr(md5(random()::text), 1, 8);
  officer uuid := gen_random_uuid(); login uuid := gen_random_uuid();
  lapsed uuid; paid uuid; archived uuid; old_life uuid; term_price uuid;
  before_count integer; rows jsonb; r jsonb; r2 jsonb; m record; yr integer := extract(year from current_date)::integer;
begin
  select id into adult from public.membership_plans where slug='adult';
  select id into term_price from public.membership_plan_prices where plan_id=adult and active order by membership_year desc, version desc limit 1;
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (officer,'authenticated','authenticated','imp-officer-'||tag||'@example.invalid',now(),'{"full_name":"Import Officer"}',now(),now()),
   (login,'authenticated','authenticated','has-login-'||tag||'@example.test',now(),'{"full_name":"Has Login"}',now(),now());
  update public.user_roles set role='administrator' where user_id=officer;

  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Lapsed Person','lapsed-'||tag||'@example.test',adult,'lapsed','officer') returning id into lapsed;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_number,date_of_birth)
   values('Paid Person','paid-'||tag||'@example.test',adult,'active','officer','07000 111111',date '1960-05-01') returning id into paid;
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   values(paid,term_price,yr,make_date(yr,1,1),make_date(yr,12,31),make_date(yr+1,3,1),'paid',2000,2000,'officer');
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Old Life','old-life-'||tag||'@example.test',adult,'lapsed','officer') returning id into old_life;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source)
   values('Archived Person','archived-'||tag||'@example.test',adult,'archived','officer') returning id into archived;

  rows := jsonb_build_array(
    jsonb_build_object('full_name','Lapsed Person','email','LAPSED-'||tag||'@example.test','membership_type','Adult member',
      'title','Mrs','date_of_birth','1970-01-01','contact_number','01234 000000','address_line_one','5 Mill Lane','city','Selby','postcode','YO8 4AA'),
    jsonb_build_object('full_name','Paid Person','email','paid-'||tag||'@example.test','membership_type','Adult member',
      'title','Mr','date_of_birth','1990-01-01','contact_number','07999 999999'),
    jsonb_build_object('full_name','Archived Person','email','archived-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','New Adult','email','new-'||tag||'@example.test','membership_type','Adult member',
      'title','Dr','date_of_birth','1958-04-01','contact_number','01904 123456','address_line_one','1 High Street',
      'address_line_two','Heslington','city','York','postcode','YO10 5DD'),
    jsonb_build_object('full_name','New Student','email','student-'||tag||'@example.test','membership_type','Student member'),
    jsonb_build_object('full_name','New Junior','email','family-'||tag||'@example.test','membership_type','Junior member','date_of_birth','2010-06-01'),
    jsonb_build_object('full_name','Parent One','email','family-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','Shared One','email','shared-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','Shared Two','email','shared-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','Has Login','email','has-login-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','No Email','email','','membership_type','Adult member'),
    jsonb_build_object('full_name','Bad Email','email','not-an-email','membership_type','Adult member'),
    jsonb_build_object('full_name','New Adult','email','new-'||tag||'@example.test','membership_type','Adult member'),
    jsonb_build_object('full_name','Old Life','email','old-life-'||tag||'@example.test','membership_type','Life (Honorary)'),
    jsonb_build_object('full_name','Volunteer One','email','volunteer-'||tag||'@example.test','membership_type','Associate Volunteer*'),
    jsonb_build_object('full_name','Life One','email','life-'||tag||'@example.test','membership_type','Life (Honorary)','date_of_birth','2031-02-30','contact_number','x')
  );

  if (select count(*) from public.membermojo_import_plan(rows, yr) where action='skip')<>4 then
    raise exception 'expected archived, bad email, the duplicate and an existing member typed honorary to be skipped: %', (select jsonb_agg(to_jsonb(p)) from public.membermojo_import_plan(rows, yr) p);
  end if;
  if (select plan_flag from public.membermojo_import_plan(rows, yr) where full_name='Life One')<>'honorary' then raise exception 'honorary not flagged'; end if;

  -- Only an officer may save.
  begin
    perform public.apply_membermojo_import(gen_random_uuid(), rows, yr, repeat('a',64));
    raise exception 'a stranger saved a list';
  exception when others then
    if sqlerrm not like '%membermojo_import_actor_invalid%' then raise; end if;
  end;

  r := public.apply_membermojo_import(officer, rows, yr, repeat('a',64));
  if (r->>'added')::int<>10 or (r->>'renewed')::int<>1 or (r->>'already_paid')::int<>1 or (r->>'skipped')::int<>4 or (r->>'honorary')::int<>2 then
    raise exception 'unexpected result %', r;
  end if;
  if (r->>'logins_linked')::int<>1 then raise exception 'existing login not linked: %', r; end if;

  select * into m from public.members where id=lapsed;
  if m.effective_state<>'active' then raise exception 'lapsed member not renewed'; end if;
  if m.title<>'Mrs' or m.date_of_birth<>date '1970-01-01' or m.contact_number<>'01234 000000' or m.postal_address->>'city'<>'Selby' then raise exception 'blank details not filled in: %', m; end if;
  select * into m from public.members where id=paid;
  if m.title<>'Mr' or m.date_of_birth<>date '1960-05-01' or m.contact_number<>'07000 111111' then raise exception 'existing details were overwritten or the blank title not filled: %', m; end if;
  if (r->>'details_filled')::int<>2 then raise exception 'expected two existing members to be filled in: %', r; end if;
  if not exists(select 1 from public.membership_terms where member_id=lapsed and membership_year=yr and status='paid' and amount_paid_pence=amount_due_pence) then raise exception 'renewed member has no paid term'; end if;
  if (select effective_state from public.members where id=archived)<>'archived' then raise exception 'archived member changed'; end if;

  select * into m from public.members where full_name='New Adult';
  if m.source<>'membermojo_cutover' or m.portal_invitation_status<>'eligible' or m.contact_role<>'self' or m.auth_user_id is not null then raise exception 'new adult wrong: %', m; end if;
  if (select count(*) from public.members where full_name='New Adult')<>1 then raise exception 'duplicate row added twice'; end if;
  if m.title<>'Dr' or m.date_of_birth<>date '1958-04-01' or m.contact_number<>'01904 123456' or m.preferred_contact_method<>'email'
    or m.postal_address<>jsonb_build_object('address_line_one','1 High Street','address_line_two','Heslington','city','York','postcode','YO10 5DD','country','United Kingdom') then
    raise exception 'new adult details wrong: %', m;
  end if;
  select * into m from public.members where full_name='Life One';
  if m.effective_state<>'honorary' or m.current_plan_id<>adult then raise exception 'life member not honorary: %', m; end if;
  if not exists(select 1 from public.honorary_memberships h where h.member_id=m.id and h.status='active' and h.reason like 'Life (Honorary)%') then raise exception 'no honorary record'; end if;
  if exists(select 1 from public.membership_terms where member_id=m.id) then raise exception 'an honorary member was given a fee'; end if;
  select * into m from public.members where full_name='Volunteer One';
  if m.effective_state<>'honorary' or exists(select 1 from public.membership_terms where member_id=m.id) then raise exception 'volunteer not honorary: %', m; end if;
  if (select effective_state from public.members where id=old_life)<>'lapsed' then raise exception 'an existing member was made honorary by the import'; end if;
  select * into m from public.members where full_name='Life One';
  if m.date_of_birth is not null or m.postal_address is not null then raise exception 'an unreadable date or missing address was invented: %', m; end if;
  select * into m from public.members where full_name='New Junior';
  if m.date_of_birth<>date '2010-06-01' then raise exception 'junior date of birth missing'; end if;
  if m.contact_role<>'guardian' or m.portal_invitation_status<>'not_requested' or m.auth_user_id is not null then raise exception 'junior wrong: %', m; end if;
  select * into m from public.members where full_name='Parent One';
  if m.contact_role<>'self' or m.portal_invitation_status<>'eligible' then raise exception 'parent sharing an email with a junior wrong: %', m; end if;
  select * into m from public.members where full_name='Shared One';
  if m.contact_role<>'shared_household' or m.portal_invitation_status<>'blocked_shared' then raise exception 'shared email wrong: %', m; end if;
  select * into m from public.members where full_name='Has Login';
  if m.auth_user_id<>login or m.portal_invitation_status<>'linked' then raise exception 'login not linked: %', m; end if;
  select * into m from public.members where full_name='No Email';
  if m.portal_invitation_status<>'not_requested' or m.preferred_contact_method<>'officer' then raise exception 'no-email member wrong: %', m; end if;
  if not exists(select 1 from public.membership_terms t join public.members x on x.id=t.member_id where x.full_name='New Student' and t.membership_year=yr and t.status='paid') then raise exception 'student has no paid term'; end if;

  -- Nobody is emailed by the import.
  if exists(select 1 from public.membership_notifications n join public.members x on x.id=n.member_id
    where (x.source='membermojo_cutover' or x.id=lapsed) and n.email_status in ('queued','failed') and n.kind not like '%-officer') then
    raise exception 'the import left an email queued';
  end if;

  if not exists(select 1 from public.audit_logs where action='membermojo.list-imported' and actor_user_id=officer) then raise exception 'no audit entry'; end if;

  -- Saving the same list again changes nothing.
  select count(*) into before_count from public.members where source='membermojo_cutover';
  r2 := public.apply_membermojo_import(officer, rows, yr, repeat('a',64));
  if (r2->>'added')::int<>0 or (r2->>'renewed')::int<>0 or (r2->>'already_paid')::int<>10 or (r2->>'details_filled')::int<>0 then raise exception 'not idempotent: %', r2; end if;
  if (select count(*) from public.members where source='membermojo_cutover')<>before_count then raise exception 'second save added members'; end if;

  if not has_function_privilege('service_role','public.apply_membermojo_import(uuid,jsonb,integer,text)','execute') then raise exception 'service_role cannot import'; end if;
  if has_function_privilege('authenticated','public.apply_membermojo_import(uuid,jsonb,integer,text)','execute') then raise exception 'members can import'; end if;
  if has_function_privilege('authenticated','public.membermojo_import_plan(jsonb,integer)','execute') then raise exception 'members can read the plan'; end if;
  if has_function_privilege('authenticated','public.discard_unsent_member_emails()','execute') then raise exception 'members can discard emails'; end if;
end
$test$;
`);
});
