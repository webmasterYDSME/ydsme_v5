import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Only reviewed presentation paths can bypass integration tests. New or
// unrecognised paths remain on the full test path.
export function classifyChanges(paths) {
  const presentationOnly = (path) =>
    /\.md$/.test(path)
    || /\.(?:css|scss)$/.test(path)
    || /^public\/.*\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|pdf)$/.test(path)
    || path === "app/under-review/page.tsx";
  const controls = (path) => /^(?:\.github\/|scripts\/|tests\/)/.test(path)
    || /^(?:package(?:-lock)?\.json|next\.config\.|tsconfig\.|playwright\.config\.)/.test(path);
  return {
    integration: paths.some((path) => controls(path) || !presentationOnly(path)),
    migrations: paths.some((path) => path.startsWith("supabase/migrations/") || controls(path)),
  };
}

export function changedScope(base, head, event, cwd = process.cwd()) {
  const sha = /^[0-9a-f]{40}$/i;
  const git = (args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  try {
    if (!sha.test(base ?? "") || !sha.test(head ?? "") || /^0+$/.test(base)) throw new Error("Missing comparison commit");
    // PRs check their complete change from the merge base; pushes check every
    // commit in the pushed range, not merely HEAD's last commit.
    const start = event === "pull_request" ? git(["merge-base", base, head]) : base;
    const paths = git(["diff", "--no-renames", "--name-only", "-z", start, head, "--"]).split("\0").filter(Boolean);
    return { ...classifyChanges(paths), paths };
  } catch {
    // New branches, missing history and diff failures must never skip checks.
    return { integration: true, migrations: true, paths: null };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = changedScope(...process.argv.slice(2));
  const output = `integration=${scope.integration}\nmigrations=${scope.migrations}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
  console.log(scope.paths === null ? "Comparison unavailable; running all checks." : `${scope.paths.length} changed paths examined.`);
}
