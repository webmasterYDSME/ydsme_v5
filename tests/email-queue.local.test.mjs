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

test("the email queue keeps immediate mail ahead of bulk mail and never passes the daily limit", () => {
  runRolledBack("Email queue database test", String.raw`
do $test$
declare
  tag text := substr(md5(random()::text), 1, 8);
  adult uuid; u uuid := gen_random_uuid(); m uuid;
  ids uuid[] := '{}'; new_id uuid; k text; n integer;
  claimed record; immediate_claimed integer; bulk_claimed integer; slot bigint; budget record;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
   values (u,'authenticated','authenticated','queue-'||tag||'@example.invalid',now(),'{"full_name":"Queue Member"}',now(),now());
  insert into public.members(auth_user_id,full_name,contact_email,current_plan_id,effective_state,source)
   values(u,'Queue Member','queue-'||tag||'@example.test',adult,'active','officer') returning id into m;

  -- Nothing else is waiting, and the ledger starts empty, so the counts below belong to this test.
  update public.membership_notifications set email_status='cancelled' where email_status in ('queued','sending');
  delete from public.email_send_ledger where id > 0;

  -- Kinds are sorted into classes when they are added.
  for k in select unnest(array['membership.renewal-invitation','membership.renewal-invitation','membership.renewal-invitation','membership.renewal-reminder','membership.application-received','membership.payment-received']) loop
    insert into public.membership_notifications(member_id,recipient_email,recipient_user_id,kind,title,body,portal_visible,deduplication_key)
     values(m,'queue-'||tag||'@example.test',u,k,'Test '||k,'Body',false,'queue-test-'||tag||'-'||gen_random_uuid()) returning id into new_id;
    ids := ids || new_id;
  end loop;
  select count(*) into n from public.membership_notifications where id = any(ids) and delivery_class='bulk';
  if n <> 4 then raise exception 'expected 4 bulk emails, got %', n; end if;
  select count(*) into n from public.membership_notifications where id = any(ids) and delivery_class='immediate';
  if n <> 2 then raise exception 'expected 2 immediate emails, got %', n; end if;

  -- A small day: 4 emails, 2 of them kept for immediate mail. Immediate mail goes first and uses its room;
  -- bulk mail may only use what is left below the reserve.
  update public.email_queue_settings set daily_limit=4, immediate_reserve=2, bulk_batch_size=10, bulk_paused=false, blocked_until=null where id;
  select count(*) filter (where delivery_class='immediate'), count(*) filter (where delivery_class='bulk') into immediate_claimed, bulk_claimed
    from public.claim_membership_notifications(50) where notification_id = any(ids);
  if immediate_claimed <> 2 or bulk_claimed <> 0 then raise exception 'small day: immediate %, bulk %', immediate_claimed, bulk_claimed; end if;
  select * into budget from public.email_budget();
  if budget.used <> 2 or budget.remaining <> 2 then raise exception 'budget after immediate mail: %', budget; end if;

  -- Give the immediate mail back, then raise the limit: bulk goes out in a batch, up to the room it has.
  update public.email_queue_settings set daily_limit=10, immediate_reserve=2, bulk_batch_size=3 where id;
  select count(*) into bulk_claimed from public.claim_membership_notifications(50) where notification_id = any(ids) and delivery_class='bulk';
  if bulk_claimed <> 3 then raise exception 'a batch of 3 bulk emails was expected, got %', bulk_claimed; end if;

  -- The reserve is honoured: bulk mail cannot take the last slots.
  update public.email_queue_settings set daily_limit=6, immediate_reserve=3 where id;
  delete from public.email_send_ledger where id > 0;
  perform public.reserve_email_slot('bulk','test'); perform public.reserve_email_slot('bulk','test'); perform public.reserve_email_slot('bulk','test');
  if public.reserve_email_slot('bulk','test') is not null then raise exception 'bulk mail passed its reserve'; end if;
  slot := public.reserve_email_slot('immediate','test');
  if slot is null then raise exception 'immediate mail should still have room'; end if;
  perform public.release_email_slot(slot, false);
  if (select used from public.email_budget()) <> 3 then raise exception 'an unsent slot should be given back'; end if;

  -- The daily limit is a hard stop for everything.
  perform public.reserve_email_slot('immediate','test'); perform public.reserve_email_slot('immediate','test'); perform public.reserve_email_slot('immediate','test');
  if public.reserve_email_slot('immediate','test') is not null then raise exception 'the daily limit was passed'; end if;

  -- The provider asking us to wait stops everything, and clears itself.
  delete from public.email_send_ledger where id > 0;
  perform public.pause_email_provider(600, 'test pause');
  if public.reserve_email_slot('immediate','test') is not null then raise exception 'sent while the provider pause was on'; end if;
  update public.email_queue_settings set blocked_until=null, blocked_reason=null where id;

  -- Paused bulk mail waits; immediate mail does not.
  update public.email_queue_settings set daily_limit=100, immediate_reserve=30, bulk_paused=true where id;
  if public.reserve_email_slot('bulk','test') is not null then raise exception 'paused bulk mail was sent'; end if;
  if public.reserve_email_slot('immediate','test') is null then raise exception 'immediate mail must not be paused'; end if;
  update public.email_queue_settings set bulk_paused=false where id;

  -- Failed and stopped mail can be put back, and waiting bulk mail can be stopped.
  update public.membership_notifications set email_status='failed', last_email_error='boom' where id = ids[1];
  if public.requeue_membership_notifications(array[ids[1]], 'ids') <> 1 then raise exception 'a failed email was not put back'; end if;
  select email_status, requeue_count into claimed from public.membership_notifications where id = ids[1];
  if claimed.email_status <> 'queued' or claimed.requeue_count <> 1 then raise exception 'requeue state: %', claimed; end if;
  update public.membership_notifications set email_status='queued', scheduled_for=now() where id = any(ids);
  n := public.cancel_queued_membership_notifications(null, 'bulk');
  if n < 4 then raise exception 'stopping bulk mail changed % emails', n; end if;
  if exists (select 1 from public.membership_notifications where id = any(ids) and delivery_class='immediate' and email_status='cancelled') then raise exception 'immediate mail was stopped with the bulk mail'; end if;

  -- Only the service role may use any of this.
  if has_function_privilege('authenticated','public.claim_membership_notifications(integer)','execute')
    or has_function_privilege('authenticated','public.reserve_email_slot(text,text,uuid)','execute')
    or has_function_privilege('authenticated','public.requeue_membership_notifications(uuid[],text)','execute')
    or has_function_privilege('anon','public.email_queue_overview()','execute') then raise exception 'the queue is open to signed-in users'; end if;
end
$test$;
`);
});
