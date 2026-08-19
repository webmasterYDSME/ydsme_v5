import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("publishes the exact club entrance and directions target", async () => {
  const [visitors, home, footer, data, migration] = await Promise.all([
    read("app/visitors/page.tsx"),
    read("app/page.tsx"),
    read("app/components/RailSite.tsx"),
    read("lib/data.ts"),
    read("supabase/migrations/202608190003_club_entrance_location.sql"),
  ]);

  assert.match(visitors, /York City &amp; District Society of Model Engineers/);
  assert.match(visitors, /Rear of The Pastures, North Lane/);
  assert.match(visitors, /53\.94183, -1\.11166/);
  assert.match(visitors, /destination=53\.94183%2C-1\.11166/);
  assert.match(visitors, /rather than relying only on the postcode/);
  assert.match(home, /Get Directions/);
  assert.match(footer, /footer-address-link/);
  assert.match(footer, /destination=53\.94183%2C-1\.11166/);
  assert.match(footer, /Get directions to the exact club entrance coordinates/);
  assert.match(data, /address_line_one: "Rear of The Pastures"/);
  assert.match(data, /address_line_two: "North Lane"/);
  assert.match(migration, /update public\.configs/);
});
