import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HOLDING_PAGE_PATH,
  shouldShowHoldingPage,
} from "../lib/deployment-visibility.mjs";

const root = new URL("../", import.meta.url);

test("the optional flag leaves the site open unless explicitly true", () => {
  for (const flag of [undefined, "", "false", "0", "1", "yes", "invalid"]) {
    assert.equal(shouldShowHoldingPage(flag, "/"), false);
    assert.equal(shouldShowHoldingPage(flag, "/signin"), false);
  }
});

test("the enabled flag gates pages while preserving APIs and the holding page", () => {
  assert.equal(HOLDING_PAGE_PATH, "/under-review");
  for (const flag of ["true", "TRUE", " true "]) {
    for (const path of ["/", "/events", "/signin", "/dashboard"]) {
      assert.equal(shouldShowHoldingPage(flag, path), true);
    }
    assert.equal(shouldShowHoldingPage(flag, HOLDING_PAGE_PATH), false);
    assert.equal(shouldShowHoldingPage(flag, "/api/stripe/webhook"), false);
  }
});

test("marks the holding experience as unavailable to search engines", async () => {
  const [proxySource, pageSource] = await Promise.all([
    readFile(new URL("proxy.ts", root), "utf8"),
    readFile(new URL("app/under-review/page.tsx", root), "utf8"),
  ]);

  assert.match(proxySource, /X-Robots-Tag.*noindex, nofollow, noarchive/);
  assert.match(proxySource, /shouldShowHoldingPage\(process\.env\.MAINTENANCE_MODE, request\.nextUrl\.pathname\)/);
  assert.match(pageSource, /index: false/);
  assert.match(pageSource, /Website under review/);
});
