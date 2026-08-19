import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
if (!['setup', 'verify', 'cleanup'].includes(mode)) {
  throw new Error("Use: node tests/journey-fixtures.mjs setup|verify|cleanup");
}

const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const env = Object.fromEntries(status.split("\n").flatMap((line) => {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert.equal(env.API_URL, "http://127.0.0.1:55321", "Journey fixtures may run only against local Supabase.");
assert.ok(env.SERVICE_ROLE_KEY && env.ANON_KEY, "Local Supabase keys are unavailable.");

const password = process.env.JOURNEY_TEST_PASSWORD;
if (mode !== "cleanup") assert.ok(password && password.length >= 12, "Set JOURNEY_TEST_PASSWORD (12+ characters).");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = [
  { email: "journey.member@example.test", name: "Journey Member", role: "member" },
  { email: "journey.committee@example.test", name: "Journey Committee", role: "committee" },
  { email: "journey.administrator@example.test", name: "Journey Administrator", role: "administrator" },
  { email: "journey.target@example.test", name: "Journey Lifecycle Target", role: "member" },
];
const eventName = "Journey Public Running Day";
const workshopTitle = "Journey Workshop Session";
const documentName = "Journey Security Upload";

async function allUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function removeFixtures() {
  const { data: events } = await admin.from("events").select("id").eq("name", eventName);
  if (events?.length) {
    const eventIds = events.map((event) => event.id);
    const { error: bookingError } = await admin.from("event_bookings").delete().in("event_id", eventIds);
    if (bookingError) throw bookingError;
    const { error: abuseSummaryError } = await admin.from("event_booking_abuse_summary").delete().in("event_id", eventIds);
    if (abuseSummaryError) throw abuseSummaryError;
    const { error: eventError } = await admin.from("events").delete().in("id", eventIds);
    if (eventError) throw eventError;
  }
  const { data: workshops } = await admin.from("workshops").select("id").eq("title", workshopTitle);
  if (workshops?.length) await admin.from("workshops").delete().in("id", workshops.map((workshop) => workshop.id));
  const { data: documents } = await admin.from("documents").select("id,file_url").eq("name", documentName);
  for (const document of documents ?? []) {
    const path = document.file_url?.replace(/^documents\//, "");
    if (path && !path.includes("..")) await admin.storage.from("documents").remove([path]);
  }
  if (documents?.length) await admin.from("documents").delete().in("id", documents.map((document) => document.id));
  await admin.from("feeds").delete().or([
    "title.eq.Journey member notice",
    `message.eq.${documentName}`,
    "message.ilike.Please welcome Journey%",
  ].join(","));
}

if (mode === "cleanup") {
  await removeFixtures();
  const users = await allUsers();
  for (const email of [...accounts.map((account) => account.email), "journey.invited@example.test"]) {
    const existing = users.find((user) => user.email === email);
    if (existing) await admin.auth.admin.deleteUser(existing.id);
  }
  console.log("Local journey fixtures removed.");
  process.exit(0);
}

const existingUsers = await allUsers();
const ids = {};
for (const account of accounts) {
  let authUser = existingUsers.find((user) => user.email === account.email);
  if (authUser) {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });
    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });
    if (error) throw error;
    authUser = data.user;
  }
  ids[account.role === "administrator" ? "administrator" : account.role === "committee" ? "committee" : account.email.includes("target") ? "target" : "member"] = authUser.id;
  const { error: profileError } = await admin.from("users").update({
    full_name: account.name,
    membership_status: "active",
    archived_at: null,
    archived_by: null,
    retention_until: null,
  }).eq("id", authUser.id);
  if (profileError) throw profileError;
  const { error: roleError } = await admin.from("user_roles").upsert({ user_id: authUser.id, role: account.role }, { onConflict: "user_id" });
  if (roleError) throw roleError;
}

if (mode === "setup") {
  await removeFixtures();
  const { data: event, error: eventError } = await admin.from("events").insert({
    name: eventName,
    descriptions: "Isolated browser-journey fixture for visitor booking and check-in.",
    start_date: "2026-09-15",
    end_date: "2026-09-15",
    start_time: "10:00",
    end_time: "16:00",
    event_type: "public",
    display_in_homepage: false,
    is_ticket_required: true,
    reservation_link: "",
    booking_enabled: true,
    booking_mode: "website",
    booking_capacity: 12,
    lifecycle_status: "published",
    host: ids.committee,
  }).select("id").single();
  if (eventError) throw eventError;
  const { data: workshop, error: workshopError } = await admin.from("workshops").insert({
    title: workshopTitle,
    descriptions: "Isolated browser-journey fixture for member reservation and committee roster management.",
    date: "2026-09-16",
    start_time: "18:00",
    end_time: "20:00",
    host_name: "Journey Committee",
    venue: "Test Workshop",
    maximum_participants: 2,
    lifecycle_status: "published",
    created_by: ids.committee,
  }).select("id").single();
  if (workshopError) throw workshopError;
  console.log(JSON.stringify({ users: ids, eventId: event.id, workshopId: workshop.id }));
}

if (mode === "verify") {
  const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicView = await anon.from("public_events").select("id,name").eq("name", eventName);
  assert.equal(publicView.error, null);
  assert.equal(publicView.data?.length, 1);
  const leakedHost = await anon.from("events").select("host").eq("name", eventName);
  assert.ok(leakedHost.error, "Anonymous callers must not read operational event columns.");
  const privateBookings = await anon.from("event_bookings").select("id");
  assert.ok(privateBookings.error, "Anonymous callers must not read bookings.");

  for (const account of accounts.slice(0, 3)) {
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await client.auth.signInWithPassword({ email: account.email, password });
    assert.equal(signIn.error, null, `${account.role} sign-in failed`);
    const allowedRead = await client.from("events").select("id,name").eq("name", eventName);
    assert.equal(allowedRead.error, null, `${account.role} portal event read failed`);
    const hostRead = await client.from("events").select("host").eq("name", eventName);
    assert.ok(hostRead.error, `${account.role} received a host UUID`);
    const directWrite = await client.from("events").update({ name: "Forbidden direct write" }).eq("id", publicView.data[0].id);
    assert.ok(directWrite.error, `${account.role} bypassed the server mutation boundary`);
  }
  console.log("Local direct-API authorization checks passed for anonymous and all three roles.");
}
