import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

test("public plan pricing preserves carry-forward while enforcing caller RLS", () => {
  readLocalSupabaseEnvironment("Membership view security tests");
  const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(projectId);
  const assertions = String.raw`
do $test$
declare actual jsonb;
begin
  select jsonb_object_agg(slug, amount_pence) into actual
  from public.public_membership_plans where slug like 'view-security-%';
  if actual is distinct from '{"view-security-current":3000,"view-security-fallback":2000}'::jsonb then
    raise exception 'Incorrect public prices for %: %', current_user, actual;
  end if;
  if exists (select 1 from public.public_membership_plans
      where slug like 'view-security-%'
      and membership_year <> public.membership_billing_year(current_date)) then
    raise exception 'Fallback must report the current billing year';
  end if;
  if exists (select 1 from public.membership_plan_prices
      where membership_year > public.membership_billing_year(current_date) or not active) then
    raise exception 'Future or inactive prices visible';
  end if;
  if exists (select 1 from public.membership_plan_prices
      where plan_id = current_setting('test.hidden_plan')::uuid) then
    raise exception 'Inactive plan prices visible through the table';
  end if;
  begin
    perform stripe_price_id from public.membership_plan_prices limit 1;
    raise exception 'Private Stripe identifiers accessible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform created_by_actor_id from public.membership_plan_prices limit 1;
    raise exception 'Private actor identifiers accessible';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege(current_user, 'public.membership_plan_prices', 'INSERT')
    or has_table_privilege(current_user, 'public.membership_plan_prices', 'UPDATE') then
    raise exception 'Public caller can modify prices';
  end if;
end;
$test$;`;
  const sql = String.raw`
begin;
insert into public.membership_plans (slug,name,minimum_age,maximum_age,active)
select 'view-security-' || kind, 'View security fixture', 18, 120, kind <> 'hidden'
from unnest(array['current','fallback','future','hidden','empty']) kind;
select set_config('test.hidden_plan', id::text, true)
from public.membership_plans where slug='view-security-hidden';
insert into public.membership_plan_prices (plan_id,membership_year,version,amount_pence,active)
select plan.id, public.membership_billing_year(current_date) + price.year_offset,
  price.version, price.amount, price.active
from (values
  ('current',-1,1,1000,true), ('current',0,1,3000,true),
  ('current',0,2,4000,false), ('current',1,1,5000,true),
  ('fallback',-2,1,1000,true), ('fallback',-1,1,2000,true),
  ('fallback',0,1,4000,false), ('fallback',1,1,5000,true),
  ('future',1,1,5000,true), ('hidden',0,1,6000,true)
) price(kind,year_offset,version,amount,active)
join public.membership_plans plan on plan.slug='view-security-' || price.kind;
set local role anon;
${assertions}
reset role;
set local role authenticated;
${assertions}
reset role;
do $test$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and not coalesce(c.reloptions @> array['security_invoker=true'],false)) then
    raise exception 'Public security definer view remains';
  end if;
end;
$test$;
rollback;`;
  const result = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ROLLBACK/);
});
