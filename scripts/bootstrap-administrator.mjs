import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1]?.trim();
}

const email = option("--email")?.toLowerCase();
const requestedUserId = option("--user-id");
assert.notEqual(Boolean(email), Boolean(requestedUserId), "Supply exactly one of --email or --user-id.");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(supabaseUrl, "Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
assert.ok(serviceRoleKey, "Set SUPABASE_SERVICE_ROLE_KEY.");

const endpoint = new URL(supabaseUrl);
const loopback = ["127.0.0.1", "localhost", "::1"].includes(endpoint.hostname);
if (!loopback) {
  assert.equal(
    option("--confirm-host"),
    endpoint.hostname,
    `Remote bootstrap requires --confirm-host ${endpoint.hostname}.`,
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingAdministrator, error: roleError } = await admin
  .from("user_roles")
  .select("user_id")
  .eq("role", "administrator")
  .limit(1)
  .maybeSingle();
assert.ifError(roleError);
assert.equal(existingAdministrator, null, "Administrator bootstrap has already been completed.");

async function findUserByEmail(targetEmail) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    assert.ifError(error);
    const match = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) return match;
    if (data.users.length < 100) return null;
  }
}

let authUser;
if (requestedUserId) {
  const { data, error } = await admin.auth.admin.getUserById(requestedUserId);
  assert.ifError(error);
  authUser = data.user;
} else {
  authUser = await findUserByEmail(email);
}
assert.ok(authUser, "The Auth user does not exist. Create and verify the account before bootstrapping it.");
assert.ok(authUser.email_confirmed_at, "The Auth user's email address has not been verified.");

const { data: promotedUserId, error: bootstrapError } = await admin.rpc(
  "bootstrap_first_administrator",
  { p_user_id: authUser.id },
);
assert.ifError(bootstrapError);
assert.equal(promotedUserId, authUser.id);

console.log(`Administrator access assigned to ${authUser.email || authUser.id} on ${endpoint.hostname}.`);
