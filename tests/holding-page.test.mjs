import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HOLDING_DEPLOYMENT_HOST,
  HOLDING_PAGE_PATH,
  shouldShowHoldingPage,
} from "../lib/deployment-visibility.mjs";

const root = new URL("../", import.meta.url);

test("shows the holding page only on the public Vercel production alias", () => {
  assert.equal(HOLDING_DEPLOYMENT_HOST, "ydsme-v5.vercel.app");
  assert.equal(HOLDING_PAGE_PATH, "/under-review");
  assert.equal(shouldShowHoldingPage("ydsme-v5.vercel.app", "/"), true);
  assert.equal(shouldShowHoldingPage("YDSME-V5.VERCEL.APP", "/privacy-policy"), true);
  assert.equal(
    shouldShowHoldingPage("ydsme-v5-git-review-rockfox.vercel.app", "/"),
    false,
  );
  assert.equal(shouldShowHoldingPage("www.yorkmodelengineers.co.uk", "/"), false);
  assert.equal(shouldShowHoldingPage("ydsme-v5.vercel.app", HOLDING_PAGE_PATH), false);
  assert.equal(shouldShowHoldingPage("ydsme-v5.vercel.app", "/api/stripe/webhook"), false);
});

test("marks the holding experience as unavailable to search engines", async () => {
  const [proxySource, pageSource] = await Promise.all([
    readFile(new URL("proxy.ts", root), "utf8"),
    readFile(new URL("app/under-review/page.tsx", root), "utf8"),
  ]);

  assert.match(proxySource, /X-Robots-Tag.*noindex, nofollow, noarchive/);
  assert.match(proxySource, /x-forwarded-host/);
  assert.match(proxySource, /headers\.get\("host"\)/);
  assert.match(pageSource, /index: false/);
  assert.match(pageSource, /Website under review/);
});
