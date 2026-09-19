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

test("a member can keep their own postal address and add a date of birth, but not rewrite one", () => {
  runRolledBack("Member own details database test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  adult uuid; me uuid := gen_random_uuid(); other uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  m uuid; other_member uuid; s jsonb; r record;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (me,'authenticated','authenticated','details-me-'||tag||'@example.invalid',now(),'{"full_name":"Details Member"}',now(),now()),
   (other,'authenticated','authenticated','details-other-'||tag||'@example.invalid',now(),'{"full_name":"Someone Else"}',now(),now()),
   (nobody,'authenticated','authenticated','details-none-'||tag||'@example.invalid',now(),'{"full_name":"Not A Member"}',now(),now());
  insert into public.members(auth_user_id,full_name,contact_email,current_plan_id,effective_state,source)
   values(me,'Details Member','details-'||tag||'@example.test',adult,'active','officer') returning id into m;
  insert into public.members(auth_user_id,full_name,contact_email,current_plan_id,effective_state,source,date_of_birth,postal_address)
   values(other,'Someone Else','other-'||tag||'@example.test',adult,'active','officer',date '1970-06-15','{"address_line_one":"9 Other Road","city":"Leeds","postcode":"LS1 1AA","country":"United Kingdom"}')
   returning id into other_member;

  -- Everything below runs as the signed-in member.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

  s := public.get_own_member_details();
  if not (s->>'linked')::boolean or s->>'date_of_birth' is not null or s->>'address_line_one' <> '' or (s->>'birth_date_locked')::boolean then
    raise exception 'starting state wrong: %', s;
  end if;

  -- Add an address and a date of birth.
  perform public.update_own_member_details('1 High Street', 'Heslington', 'York', 'YO10 5DD', date '1958-04-15');
  s := public.get_own_member_details();
  if s->>'address_line_one' <> '1 High Street' or s->>'city' <> 'York' or s->>'postcode' <> 'YO10 5DD' or s->>'date_of_birth' <> '1958-04-15' or not (s->>'birth_date_locked')::boolean then
    raise exception 'details not saved: %', s;
  end if;
  reset role;
  select postal_address->>'country' as country into r from public.members where id=m;
  if r.country <> 'United Kingdom' then raise exception 'country not defaulted: %', r; end if;
  if not exists (select 1 from public.audit_logs where action='member.details-updated' and actor_user_id=me and entity_id=m::text) then raise exception 'save not audited'; end if;

  -- Once a real day is on record, the member cannot change or remove it, whether or not the address changes.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  begin perform public.update_own_member_details('1 High Street', null, 'York', 'YO10 5DD', date '1958-04-16'); raise exception 'a locked date of birth was changed';
  exception when others then if sqlerrm <> 'member_birth_date_locked' then raise; end if; end;
  -- Leaving the date out keeps it and still updates the address.
  perform public.update_own_member_details('2 Low Street', null, 'York', 'yo1 7hh');
  s := public.get_own_member_details();
  if s->>'date_of_birth' <> '1958-04-15' or s->>'address_line_one' <> '2 Low Street' or s->>'address_line_two' <> '' then raise exception 'address update disturbed the birth date: %', s; end if;

  -- An address with no line 1, town or postcode is cleared.
  perform public.update_own_member_details(null, null, null, null);
  s := public.get_own_member_details();
  if s->>'address_line_one' <> '' or s->>'postcode' <> '' or s->>'date_of_birth' <> '1958-04-15' then raise exception 'address not cleared cleanly: %', s; end if;

  -- Too-long values are refused.
  begin perform public.update_own_member_details(repeat('x', 181), null, null, null); raise exception 'an over-long address was accepted';
  exception when others then if sqlerrm <> 'member_details_invalid' then raise; end if; end;

  -- A date of birth only known to the month (imported as the 1st) can be given its real day, and only within that month.
  reset role;
  update public.members set date_of_birth = date '1958-04-01' where id=m;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  s := public.get_own_member_details();
  if not (s->>'birth_day_unconfirmed')::boolean or (s->>'birth_date_locked')::boolean then raise exception 'imported date not flagged as unconfirmed: %', s; end if;
  begin perform public.update_own_member_details(null, null, null, null, date '1958-05-15'); raise exception 'a different month was accepted';
  exception when others then if sqlerrm <> 'member_birth_date_locked' then raise; end if; end;
  perform public.update_own_member_details(null, null, null, null, date '1958-04-22');
  s := public.get_own_member_details();
  if s->>'date_of_birth' <> '1958-04-22' or not (s->>'birth_date_locked')::boolean then raise exception 'the real day was not saved: %', s; end if;

  -- A blank date of birth cannot be set to an impossible date.
  reset role;
  update public.members set date_of_birth = null where id=m;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  begin perform public.update_own_member_details(null, null, null, null, current_date + 1); raise exception 'a future date of birth was accepted';
  exception when others then if sqlerrm <> 'member_birth_date_invalid' then raise; end if; end;
  begin perform public.update_own_member_details(null, null, null, null, date '1800-01-01'); raise exception 'a date before 1900 was accepted';
  exception when others then if sqlerrm <> 'member_birth_date_invalid' then raise; end if; end;

  -- Members only ever reach their own record.
  reset role;
  select date_of_birth, postal_address->>'postcode' as postcode into r from public.members where id=other_member;
  if r.date_of_birth <> date '1970-06-15' or r.postcode <> 'LS1 1AA' then raise exception 'another member was changed: %', r; end if;

  -- A login with no membership record has nothing to change.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', nobody, 'role', 'authenticated')::text, true);
  if (public.get_own_member_details()->>'linked')::boolean then raise exception 'an unlinked login was shown as linked'; end if;
  begin perform public.update_own_member_details('1 High Street', null, 'York', 'YO1 1AA'); raise exception 'an unlinked login could save';
  exception when others then if sqlerrm <> 'member_details_member_not_found' then raise; end if; end;
  reset role;

  -- Signed-out visitors cannot use either function.
  set local role anon;
  begin perform public.get_own_member_details(); raise exception 'anon could read details';
  exception when insufficient_privilege then null; end;
  begin perform public.update_own_member_details('1 High Street', null, 'York', 'YO1 1AA'); raise exception 'anon could save details';
  exception when insufficient_privilege then null; end;
  reset role;
end
$test$;
`);
});
