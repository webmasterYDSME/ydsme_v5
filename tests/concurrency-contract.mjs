import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const password = process.env.JOURNEY_TEST_PASSWORD;
assert.ok(password && password.length >= 12, "Set JOURNEY_TEST_PASSWORD (12+ characters).");
const status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const env = Object.fromEntries(status.split("\n").flatMap((line) => {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert.equal(env.API_URL, "http://127.0.0.1:54321", "Concurrency tests may run only against local Supabase.");

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: profiles, error: profileError } = await admin.from("users")
  .select("id,email")
  .in("email", ["journey.member@example.test", "journey.target@example.test"]);
if (profileError) throw profileError;
assert.equal(profiles.length, 2, "Run the journey fixture setup first.");
const memberId = profiles.find((profile) => profile.email === "journey.member@example.test").id;
const unique = crypto.randomUUID().slice(0, 8);
let workshopId;
let eventId;

try {
  const workshopResult = await admin.from("workshops").insert({
    title: `Concurrency workshop ${unique}`,
    descriptions: "Atomic final-place contract test",
    date: "2026-09-20",
    start_time: "10:00",
    end_time: "11:00",
    host_name: "Contract test",
    venue: "Test workshop",
    maximum_participants: 1,
    lifecycle_status: "published",
    created_by: memberId,
  }).select("id").single();
  if (workshopResult.error) throw workshopResult.error;
  workshopId = workshopResult.data.id;

  const memberClients = await Promise.all([
    ["journey.member@example.test", password],
    ["journey.target@example.test", password],
  ].map(async ([email, accountPassword]) => {
    const client = createClient(env.API_URL, env.PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: accountPassword });
    if (error) throw error;
    return client;
  }));
  const workshopAttempts = await Promise.all(memberClients.map((client) =>
    client.rpc("reserve_workshop_place", { p_workshop_id: workshopId })));
  assert.equal(workshopAttempts.filter((result) => !result.error).length, 1, "Exactly one final workshop place must be reserved.");
  assert.equal(workshopAttempts.filter((result) => result.error).length, 1, "The competing workshop reservation must be rejected.");

  const eventResult = await admin.from("events").insert({
    name: `Concurrency event ${unique}`,
    descriptions: "Atomic final-place contract test",
    start_date: "2026-09-21",
    end_date: "2026-09-21",
    start_time: "10:00",
    end_time: "11:00",
    event_type: "public",
    booking_enabled: true,
    booking_mode: "website",
    booking_capacity: 1,
    lifecycle_status: "published",
    host: memberId,
  }).select("id").single();
  if (eventResult.error) throw eventResult.error;
  eventId = eventResult.data.id;
  const bookingAttempts = await Promise.all([
    admin.rpc("create_event_booking", { p_event_id: eventId, p_lead_name: "First", p_email: `first-${unique}@example.test`, p_party_size: 1, p_reference_code: `YME-${unique}-A` }),
    admin.rpc("create_event_booking", { p_event_id: eventId, p_lead_name: "Second", p_email: `second-${unique}@example.test`, p_party_size: 1, p_reference_code: `YME-${unique}-B` }),
  ]);
  assert.equal(bookingAttempts.filter((result) => !result.error).length, 1, "Exactly one final visitor place must be booked.");
  assert.equal(bookingAttempts.filter((result) => result.error).length, 1, "The competing visitor booking must be rejected.");
  console.log("Workshop and visitor final-place concurrency checks passed.");
} finally {
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  if (workshopId) await admin.from("workshops").delete().eq("id", workshopId);
}
