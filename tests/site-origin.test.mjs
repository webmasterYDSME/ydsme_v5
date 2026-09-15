import test from "node:test";
import assert from "node:assert/strict";
import { resolveSiteOrigin, SITE_URL } from "../lib/site-origin.mjs";

test("legacy production configuration matches the browser's redirected origin", () => {
  const trusted = resolveSiteOrigin("https://www.yorkmodelengineers.co.uk/");
  assert.equal(trusted, "https://yorkmodelengineers.co.uk");
  assert.equal(resolveSiteOrigin(SITE_URL), trusted);
  for (const origin of [null, "null", "https://evil.example", "https://yorkmodelengineers.co.uk.evil.example", "http://yorkmodelengineers.co.uk", "https://yorkmodelengineers.co.uk:444", "https://www.yorkmodelengineers.co.uk"]) {
    assert.notEqual(origin, trusted);
  }
});

test("local and preview origins retain their exact hostname and port", () => {
  for (const origin of ["http://localhost:3010", "http://127.0.0.1:3010", "https://example-preview.vercel.app", "https://www.yorkmodelengineers.co.uk:444"]) {
    assert.equal(resolveSiteOrigin(origin), origin);
  }
  for (const origin of ["http://yorkmodelengineers.co.uk", "http://evil.example", "javascript:alert(1)", "not a URL"]) {
    assert.throws(() => resolveSiteOrigin(origin));
  }
});
