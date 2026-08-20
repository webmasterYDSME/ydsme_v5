import assert from "node:assert/strict";
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
for (const line of diff.split("\n")) {
  const [status, firstPath, secondPath] = line.split("\t");
  if (status === "A" && firstPath?.endsWith(".sql")) {
    added.push(firstPath);
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

console.log(`Validated ${added.length} new additive migration file(s).`);
