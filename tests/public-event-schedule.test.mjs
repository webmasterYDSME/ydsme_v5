import assert from "node:assert/strict";
import test from "node:test";
import { upcomingEvents } from "../lib/public-event-schedule.ts";
const event = (id, overrides = {}) => ({ id, start_date: "2026-09-27", end_date: "2026-09-27", start_time: "12:00:00", end_time: "16:00:00", ...overrides });

test("public events advance at the end time in British summer time", () => {
  const events = [event(1), event(2, { start_date: "2026-10-25", end_date: "2026-10-25" })];
  assert.deepEqual(upcomingEvents(events, new Date("2026-09-27T14:59:59Z")).map(e => e.id), [1, 2]);
  assert.deepEqual(upcomingEvents(events, new Date("2026-09-27T15:00:00Z")).map(e => e.id), [2]);
});
test("winter events use GMT, retain ongoing multi-day events, and sort without mutating input", () => {
  const events = [event(3, { start_date: "2026-12-03", end_date: "2026-12-03" }), event(2, { start_date: "2026-12-01", end_date: "2026-12-02", end_time: "16:00" }), event(1, { start_date: "2026-12-02", end_date: "2026-12-02", end_time: "15:00" })];
  assert.deepEqual(upcomingEvents(events, new Date("2026-12-02T15:30:00Z")).map(e => e.id), [2, 3]);
  assert.deepEqual(events.map(e => e.id), [3, 2, 1]);
});
test("no remaining events gives an empty selection for the fixed-banner fallback", () => {
  assert.deepEqual(upcomingEvents([], new Date("2026-09-27T16:00:00Z")), []);
  assert.deepEqual(upcomingEvents([event(1)], new Date("2026-09-27T16:00:00Z")), []);
});
