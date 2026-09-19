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

test("a member can subscribe to and leave the newsletter from their account", () => {
  runRolledBack("Member newsletter preference database test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  adult uuid; me uuid := gen_random_uuid(); other uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  m uuid; blocked_member uuid; s jsonb; r record; email text; blocked_email text;
begin
  select id into adult from public.membership_plans where slug='adult';
  email := 'newsletter-'||tag||'@example.test'; blocked_email := 'bounced-'||tag||'@example.test';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (me,'authenticated','authenticated','nl-me-'||tag||'@example.invalid',now(),'{"full_name":"Newsletter Member"}',now(),now()),
   (other,'authenticated','authenticated','nl-other-'||tag||'@example.invalid',now(),'{"full_name":"Bounced Member"}',now(),now()),
   (nobody,'authenticated','authenticated','nl-none-'||tag||'@example.invalid',now(),'{"full_name":"Not A Member"}',now(),now());
  insert into public.members(auth_user_id,full_name,contact_email,current_plan_id,effective_state,source)
   values(me,'Newsletter Member',email,adult,'active','officer') returning id into m;
  insert into public.members(auth_user_id,full_name,contact_email,current_plan_id,effective_state,source)
   values(other,'Bounced Member',blocked_email,adult,'active','officer') returning id into blocked_member;

  -- Everything below runs as the signed-in member.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);

  s := public.get_own_newsletter_preference();
  if not (s->>'linked')::boolean or (s->>'subscribed')::boolean or s->>'email' <> email then raise exception 'starting state wrong: %', s; end if;

  s := public.set_own_newsletter_preference(true);
  if not (s->>'subscribed')::boolean or s->>'source' <> 'member_account' or s->>'since' <> current_date::text then raise exception 'subscribe did not take: %', s; end if;
  reset role;
  select newsletter_opt_in, newsletter_consent_source, newsletter_consent_given_on, newsletter_consent_recorded_at into r from public.members where id=m;
  if not r.newsletter_opt_in or r.newsletter_consent_source <> 'member_account' or r.newsletter_consent_recorded_at is null then raise exception 'consent not recorded: %', r; end if;
  if not exists (select 1 from public.audit_logs where action='member.newsletter-subscribed' and actor_user_id=me and entity_id=m::text) then raise exception 'subscribe not audited'; end if;

  -- Subscribing twice changes nothing and is not audited twice.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  perform public.set_own_newsletter_preference(true);
  reset role;
  if (select count(*) from public.audit_logs where action='member.newsletter-subscribed' and entity_id=m::text) <> 1 then raise exception 'repeat subscribe was audited again'; end if;

  -- Someone used the unsubscribe link in a newsletter: the whole mailbox is off until the member chooses again.
  insert into public.membership_email_suppressions(normalized_email,newsletter_suppressed,transactional_suppressed,reason)
   values(email,true,false,'The shared mailbox used the newsletter unsubscribe link.');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  s := public.get_own_newsletter_preference();
  if (s->>'subscribed')::boolean or not (s->>'mailbox_unsubscribed')::boolean or not (s->>'opted_in')::boolean then raise exception 'mailbox unsubscribe not shown: %', s; end if;
  s := public.set_own_newsletter_preference(true);
  if not (s->>'subscribed')::boolean or (s->>'mailbox_unsubscribed')::boolean then raise exception 'subscribing again did not lift the mailbox unsubscribe: %', s; end if;

  -- Leaving clears the record.
  s := public.set_own_newsletter_preference(false);
  if (s->>'subscribed')::boolean or (s->>'opted_in')::boolean then raise exception 'unsubscribe did not take: %', s; end if;
  reset role;
  select newsletter_opt_in, newsletter_consent_source, newsletter_consent_given_on, newsletter_consent_recorded_at into r from public.members where id=m;
  if r.newsletter_opt_in or r.newsletter_consent_source is not null or r.newsletter_consent_given_on is not null or r.newsletter_consent_recorded_at is not null then raise exception 'consent record not cleared: %', r; end if;
  if not exists (select 1 from public.audit_logs where action='member.newsletter-unsubscribed' and actor_user_id=me) then raise exception 'unsubscribe not audited'; end if;

  -- An address that bounced cannot be added, and the block is not lifted.
  insert into public.membership_email_suppressions(normalized_email,newsletter_suppressed,transactional_suppressed,reason)
   values(blocked_email,true,true,'Emails to this address bounced.');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  s := public.get_own_newsletter_preference();
  if not (s->>'address_blocked')::boolean then raise exception 'blocked address not shown: %', s; end if;
  begin perform public.set_own_newsletter_preference(true); raise exception 'a blocked address was subscribed';
  exception when others then if sqlerrm <> 'newsletter_address_blocked' then raise; end if; end;
  reset role;
  if not (select transactional_suppressed from public.membership_email_suppressions where normalized_email=blocked_email) then raise exception 'the bounce block was lifted'; end if;

  -- A member with no email cannot subscribe.
  update public.members set contact_email=null where id=blocked_member;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  begin perform public.set_own_newsletter_preference(true); raise exception 'subscribed without an email';
  exception when others then if sqlerrm <> 'newsletter_email_required' then raise; end if; end;

  -- A login with no membership record has nothing to change.
  perform set_config('request.jwt.claims', json_build_object('sub', nobody, 'role', 'authenticated')::text, true);
  if (public.get_own_newsletter_preference()->>'linked')::boolean then raise exception 'an unlinked login was shown as linked'; end if;
  begin perform public.set_own_newsletter_preference(true); raise exception 'an unlinked login could subscribe';
  exception when others then if sqlerrm <> 'newsletter_member_not_found' then raise; end if; end;
  reset role;

  -- Signed-out visitors cannot use either function.
  set local role anon;
  begin perform public.get_own_newsletter_preference(); raise exception 'anon could read a preference';
  exception when insufficient_privilege then null; end;
  begin perform public.set_own_newsletter_preference(true); raise exception 'anon could subscribe';
  exception when insufficient_privilege then null; end;
  reset role;
end
$test$;
`);
});
