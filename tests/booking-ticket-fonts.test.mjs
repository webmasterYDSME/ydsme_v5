import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// The ticket is drawn by sharp from SVG text. Servers have no fonts of their own, so an unbundled ticket comes out as rows of empty boxes.
test("the booking ticket ships its own fonts and points the renderer at them", () => {
  for (const file of ["TicketSans-Regular.ttf", "TicketSans-Bold.ttf", "TicketSerif-Bold.ttf", "LICENSE.txt", "README.txt"]) {
    assert.ok(existsSync(new URL(`../lib/ticket-fonts/${file}`, import.meta.url)), `lib/ticket-fonts/${file} is missing`);
  }
  const ticket = read("lib/booking-ticket.ts");
  assert.match(ticket, /process\.env\.FONTCONFIG_FILE = configPath/);
  assert.match(ticket, /pointRendererAtTicketFonts\(\);\s*const buffer = await sharp\(svg\)/);
  assert.doesNotMatch(ticket, /font-family="(?:Arial|Georgia)/, "text must use TICKET_SANS / TICKET_SERIF, which name the bundled fonts first");
  assert.match(ticket, /TICKET_SANS = "YME Ticket Sans, /);
  assert.match(ticket, /TICKET_SERIF = "YME Ticket Serif, /);
});

test("the bundled ticket fonts stay small, since they are added to every serverless function", () => {
  let total = 0;
  for (const file of ["TicketSans-Regular.ttf", "TicketSans-Bold.ttf", "TicketSerif-Bold.ttf"]) total += statSync(new URL(`../lib/ticket-fonts/${file}`, import.meta.url)).size;
  assert.ok(total < 150_000, `ticket fonts are ${total} bytes; keep them to Latin subsets`);
});

test("the ticket fonts are included in the deployed server bundle", () => {
  assert.match(read("next.config.ts"), /outputFileTracingIncludes:\s*\{\s*"\/\*\*":\s*\["\.\/lib\/ticket-fonts\/\*"\]/);
});
