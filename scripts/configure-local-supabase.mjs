import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const workdir = process.env.SUPABASE_WORKDIR || ".";
const supabase = (...args) => execFileSync(
  "npx",
  ["supabase", ...args, "--workdir", workdir],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const queryLocalDatabase = (sql) => execFileSync(
  "npx",
  ["supabase", "db", "query", "--local", "--workdir", workdir],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
);

const status = supabase("status", "-o", "env");
const local = Object.fromEntries(status.split("\n").flatMap((line) => {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  return match ? [[match[1], match[2]]] : [];
}));

assert.equal(
  local.API_URL,
  "http://127.0.0.1:55321",
  "Refusing to configure Vault because Supabase is not the isolated local stack.",
);
assert.match(
  local.DB_URL || "",
  /^postgresql:\/\/postgres:postgres@127\.0\.0\.1:55322\/postgres$/,
  "Refusing to configure Vault because the database is not the isolated local stack.",
);
assert.ok(local.SECRET_KEY, "The local Supabase secret key is unavailable.");

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const upsertSecret = (name, value, description) => `
  select id into v_secret_id from vault.secrets where name = ${quote(name)} limit 1;
  if v_secret_id is null then
    perform vault.create_secret(${quote(value)}, ${quote(name)}, ${quote(description)});
  else
    perform vault.update_secret(v_secret_id, ${quote(value)}, ${quote(name)}, ${quote(description)});
  end if;
  v_secret_id := null;
`;

const sql = `do $$
declare v_secret_id uuid;
begin
  ${upsertSecret("project_url", "http://kong:8000", "Local Supabase API address used by database jobs.")}
  ${upsertSecret("maintenance_secret_key", local.SECRET_KEY, "Local-only secret key used by scheduled maintenance jobs.")}
end
$$;`;

// Pass SQL over stdin so the local secret never appears in a process argument.
queryLocalDatabase(sql);
console.log("Configured local Supabase scheduled-job credentials.");
