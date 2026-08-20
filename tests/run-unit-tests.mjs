import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync(new URL("./", import.meta.url))
  .filter((file) => file.endsWith(".test.mjs") && !file.endsWith(".local.test.mjs"))
  .sort()
  .map((file) => `tests/${file}`);

if (files.length === 0) throw new Error("No unit or source-contract tests were found.");

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...files],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
