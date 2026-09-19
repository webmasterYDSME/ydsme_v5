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

test("background website invitations: start, claim, record, back off, finish and pause", () => {
  runRolledBack("MemberMojo background invitation database test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  officer uuid := gen_random_uuid(); login uuid := gen_random_uuid(); existing uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  adult uuid; m_sent uuid; m_linked uuid; m_gave_up uuid; m_shared uuid; m_waiting uuid;
  base integer; s jsonb; r public.member_invitation_run%rowtype; finished_before integer; i integer; got integer;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (officer,'authenticated','authenticated','inv-officer-'||tag||'@example.invalid',now(),'{"full_name":"Invite Officer"}',now(),now()),
   (login,'authenticated','authenticated','inv-login-'||tag||'@example.invalid',now(),'{"full_name":"Invited Login"}',now(),now()),
   (existing,'authenticated','authenticated','inv-existing-'||tag||'@example.invalid',now(),'{"full_name":"Existing Login"}',now(),now());
  update public.user_roles set role='administrator' where user_id=officer;

  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_role,portal_invitation_status)
   values('Run Sent','run-sent-'||tag||'@example.test',adult,'active','membermojo_cutover','self','eligible') returning id into m_sent;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_role,portal_invitation_status)
   values('Run Linked','run-linked-'||tag||'@example.test',adult,'active','membermojo_cutover','self','eligible') returning id into m_linked;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_role,portal_invitation_status)
   values('Run Gave Up','run-gave-up-'||tag||'@example.test',adult,'active','membermojo_cutover','self','eligible') returning id into m_gave_up;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_role,portal_invitation_status)
   values('Run Shared','run-shared-'||tag||'@example.test',adult,'active','membermojo_cutover','self','eligible') returning id into m_shared;

  -- Somebody who is still waiting after everyone above has been dealt with, so the run has work left.
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source,contact_role,portal_invitation_status)
   values('Run Waiting','run-waiting-'||tag||'@example.test',adult,'active','membermojo_cutover','self','eligible') returning id into m_waiting;

  -- The job is scheduled every five minutes, and only known jobs can be requested.
  if not exists (select 1 from cron.job where jobname='member-invitations' and schedule='*/5 * * * *') then raise exception 'invitation job is not scheduled'; end if;
  begin perform public.request_membership_automation('nonsense'); raise exception 'an unknown job was accepted';
  exception when others then if sqlerrm <> 'membership_automation_job_invalid' then raise; end if; end;

  -- Everything below runs as the server does, not as the database owner.
  set local role service_role;

  begin perform public.start_member_invitations(stranger); raise exception 'someone without membership rights started the run';
  exception when others then if sqlerrm <> 'member_invitations_actor_invalid' then raise; end if; end;

  s := public.start_member_invitations(officer);
  if not (s->>'enabled')::boolean then raise exception 'start did not switch the run on: %', s; end if;
  base := (s->>'pending')::integer;
  if base < 5 then raise exception 'the five test members should be waiting: %', s; end if;
  if (s->>'sent')::integer<>0 or (s->>'linked')::integer<>0 or (s->>'failed')::integer<>0 then raise exception 'counters were not reset: %', s; end if;

  -- Only one run works at a time.
  if not public.claim_member_invitation_run() then raise exception 'the first claim should succeed'; end if;
  if public.claim_member_invitation_run() then raise exception 'an overlapping run was allowed'; end if;

  -- The batch is limited, however large a number is asked for.
  select count(*) into got from public.next_member_invitations(1000);
  if got > 25 or got < 1 then raise exception 'batch size not limited: %', got; end if;
  select count(*) into got from public.next_member_invitations(1);
  if got <> 1 then raise exception 'batch of one expected: %', got; end if;

  -- Outcomes.
  perform public.record_member_invitation(m_sent, 'sent', login, null);
  if (select portal_invitation_status||coalesce(auth_user_id::text,'') from public.members where id=m_sent) <> 'sent'||login::text then
    raise exception 'a sent invitation did not link the new login'; end if;
  perform public.record_member_invitation(m_linked, 'linked', existing, null);
  if (select portal_invitation_status from public.members where id=m_linked) <> 'linked' then raise exception 'linked outcome not stored'; end if;
  perform public.record_member_invitation(m_shared, 'blocked_shared', null, null);
  if (select portal_invitation_status||coalesce(auth_user_id::text,'-') from public.members where id=m_shared) <> 'blocked_shared-' then raise exception 'shared outcome wrong'; end if;
  begin perform public.record_member_invitation(m_sent, 'banana', null, null); raise exception 'an unknown outcome was accepted';
  exception when others then if sqlerrm <> 'member_invitation_outcome_invalid' then raise; end if; end;

  -- A failure is retried, but only five times.
  for i in 1..4 loop perform public.record_member_invitation(m_gave_up, 'failed', null, 'Mail server said no'); end loop;
  if not exists (select 1 from public.member_invitation_pending where id=m_gave_up and attempts=4) then
    raise exception 'a member with four failures should still be waiting'; end if;
  perform public.record_member_invitation(m_gave_up, 'failed', null, 'Mail server said no');
  if exists (select 1 from public.member_invitation_pending where id=m_gave_up and attempts<5) then raise exception 'a member with five failures is still waiting'; end if;
  s := public.member_invitation_status();
  if (s->>'sent')::integer<>1 or (s->>'linked')::integer<>1 or (s->>'failed')::integer<>5 then raise exception 'counters wrong: %', s; end if;
  if (s->>'pending')::integer <> base-4 then raise exception 'pending should have fallen by four (sent, linked, shared, and the one that gave up): % vs %', s, base; end if;
  if (s->>'gave_up')::integer < 1 then raise exception 'gave_up not reported: %', s; end if;

  -- Supabase Auth refusing because of its hourly email limit: wait, then carry on.
  s := public.finish_member_invitation_run(true, null);
  if not (s->>'enabled')::boolean then raise exception 'the run must stay on while waiting for the email limit'; end if;
  if s->>'paused_until' is null then raise exception 'no wait was recorded: %', s; end if;
  if public.claim_member_invitation_run() then raise exception 'a run started during the wait'; end if;
  update public.member_invitation_run set paused_until = now() - interval '1 minute' where singleton;
  if not public.claim_member_invitation_run() then raise exception 'the run did not resume after the wait'; end if;
  s := public.finish_member_invitation_run(false, null);
  if s->>'paused_until' is not null then raise exception 'wait was not cleared: %', s; end if;

  -- Starting again gives failed people another go.
  s := public.start_member_invitations(officer);
  if not exists (select 1 from public.member_invitation_pending where id=m_gave_up and attempts=0) then raise exception 'starting again did not reset attempts'; end if;

  -- Pause, and an audit trail.
  s := public.pause_member_invitations(officer);
  if (s->>'enabled')::boolean then raise exception 'pause did not switch the run off'; end if;
  if public.claim_member_invitation_run() then raise exception 'a paused run was claimed'; end if;
  if not exists (select 1 from public.audit_logs where action='membermojo.invitations-paused' and actor_user_id=officer) then raise exception 'pause not audited'; end if;
  if not exists (select 1 from public.audit_logs where action='membermojo.invitations-started' and actor_user_id=officer) then raise exception 'start not audited'; end if;

  -- The run switches itself off when nobody is left.
  s := public.start_member_invitations(officer);
  reset role;
  insert into public.member_invitation_attempts(member_id, attempts, last_attempt_at)
   select id, 5, now() from public.member_invitation_pending
   on conflict (member_id) do update set attempts = 5;
  set local role service_role;
  select count(*) into finished_before from public.audit_logs where action='membermojo.invitations-finished';
  perform public.claim_member_invitation_run();
  s := public.finish_member_invitation_run(false, null);
  if (s->>'enabled')::boolean or s->>'finished_at' is null then raise exception 'the run did not stop when nobody was left: %', s; end if;
  if (select count(*) from public.audit_logs where action='membermojo.invitations-finished') <> finished_before+1 then raise exception 'finish not audited'; end if;
  -- Finishing again does not repeat the audit entry.
  perform public.finish_member_invitation_run(false, null);
  if (select count(*) from public.audit_logs where action='membermojo.invitations-finished') <> finished_before+1 then raise exception 'finish audited twice'; end if;

  -- Nobody but the server may use any of it.
  reset role;
  foreach i in array array[1,2] loop
    if i = 1 then set local role anon; else set local role authenticated; end if;
    begin perform public.member_invitation_status(); raise exception 'this role could read the invitation progress';
    exception when insufficient_privilege then null; end;
    begin perform public.start_member_invitations(officer); raise exception 'this role could start the run';
    exception when insufficient_privilege then null; end;
    begin perform 1 from public.member_invitation_attempts; raise exception 'this role could read invitation attempts';
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
end
$test$;
`);
});
