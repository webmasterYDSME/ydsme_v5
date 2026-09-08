import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

test("carries the latest officer-set fee into an immutable membership-year snapshot", () => {
  readLocalSupabaseEnvironment("Membership price carry-forward tests");
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId);

  const sql = String.raw`
begin;
do $test$
declare
  v_plan uuid;
  v_source public.membership_plan_prices%rowtype;
  v_first record;
  v_second record;
  v_target_year integer := 2198;
begin
  select id into v_plan from public.membership_plans where slug='adult';
  select * into v_source from public.membership_plan_prices
  where plan_id=v_plan and active and membership_year<v_target_year
  order by membership_year desc,version desc limit 1;
  if v_source.id is null then raise exception 'source fee unavailable'; end if;

  select * into v_first from public.ensure_membership_plan_price(v_plan,v_target_year);
  select * into v_second from public.ensure_membership_plan_price(v_plan,v_target_year);

  if v_first.id<>v_second.id then raise exception 'carry-forward was not idempotent'; end if;
  if v_first.membership_year<>v_target_year
    or v_first.amount_pence<>v_source.amount_pence
    or v_first.currency<>v_source.currency
    or v_first.stripe_price_id is distinct from v_source.stripe_price_id
    or v_first.carried_forward_from_id<>v_source.id then
    raise exception 'carried fee does not preserve its source';
  end if;
  if (select count(*) from public.membership_plan_prices
      where plan_id=v_plan and membership_year=v_target_year and active)<>1 then
    raise exception 'carry-forward created more than one active yearly fee';
  end if;
  if has_function_privilege('authenticated','public.ensure_membership_plan_price(uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.roll_forward_membership_plan_prices(integer)','EXECUTE') then
    raise exception 'authenticated users can create financial snapshots';
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
