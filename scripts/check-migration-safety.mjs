import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [base, head] = process.argv.slice(2);
const sha = /^[0-9a-f]{40}$/i;
assert.match(base ?? "", sha, "A full base commit SHA is required.");
assert.match(head ?? "", sha, "A full head commit SHA is required.");

const diff = execFileSync(
  "git",
  ["diff", "--name-status", "--find-renames", base, head, "--", "supabase/migrations"],
  { encoding: "utf8" },
).trim();

if (!diff) {
  console.log("No database migration files changed.");
  process.exit(0);
}

const added = [];
const immutableHistoryChanges = [];
const reviewedReplayRepair = {
  path: "supabase/migrations/202608180004_secure_dashboard.sql",
  // Both reviewed source versions can be promoted to the same repaired file:
  // original production, or the intermediate staging replay repair.
  before: [
    "e85e272056da1c2909227340395075ee3019640c0e2283d3e612475e88fe8018",
    "ffde46ca7af154818d0e2da40349f33d7e05d35f3e7ccc24f3d02855a24cdde3",
  ],
  after: "072c264e427363a7ece9f812298cadb6df5a286d26e76f5430d6238be2363bf0",
};
const reviewedRepairs = [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

for (const line of diff.split("\n")) {
  const [status, firstPath, secondPath] = line.split("\t");
  if (status === "A" && firstPath?.endsWith(".sql")) {
    added.push(firstPath);
  } else if (status === "M" && firstPath === reviewedReplayRepair.path) {
    const before = execFileSync("git", ["show", `${base}:${firstPath}`]);
    const after = execFileSync("git", ["show", `${head}:${firstPath}`]);
    if (reviewedReplayRepair.before.includes(sha256(before)) && sha256(after) === reviewedReplayRepair.after) {
      reviewedRepairs.push(firstPath);
    } else {
      immutableHistoryChanges.push(`${status} ${firstPath}`);
    }
  } else {
    immutableHistoryChanges.push([status, firstPath, secondPath].filter(Boolean).join(" "));
  }
}

assert.deepEqual(
  immutableHistoryChanges,
  [],
  `Applied migration history is immutable; create a new migration instead:\n${immutableHistoryChanges.join("\n")}`,
);

const destructivePatterns = [
  [/\bdrop\s+(?:table|schema)\b/i, "DROP TABLE/SCHEMA"],
  [/\btruncate(?:\s+table)?\b/i, "TRUNCATE"],
  [/\balter\s+table[\s\S]{0,500}?\bdrop\s+column\b/i, "ALTER TABLE ... DROP COLUMN"],
];

const rejected = [];
for (const file of added) {
  const sql = readFileSync(file, "utf8");
  for (const [pattern, label] of destructivePatterns) {
    if (pattern.test(sql)) rejected.push(`${file}: ${label}`);
  }
}

assert.deepEqual(
  rejected,
  [],
  `High-risk migrations are never auto-deployed. Use a separately reviewed manual rollout:\n${rejected.join("\n")}`,
);

console.log(
  `Validated ${added.length} new additive migration file(s) and ${reviewedRepairs.length} checksum-locked replay repair(s).`,
);
