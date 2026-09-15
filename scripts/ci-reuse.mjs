import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// A marker is published only after all selected checks pass. Inspect GitHub's
// metadata; never download or execute content from a previous workflow run.
export const markerName = (tree, coverage) => `ci-verified-v1-${tree}-${coverage}`;

export async function findVerification({ tree, integration, repository, repositoryId, runId, attempt, get }) {
  if (!/^[a-f0-9]{40}$/.test(tree) || !repository || !repositoryId || !runId || attempt !== "1") return null;
  try {
    const workflow = await get(`/repos/${repository}/actions/workflows/ci.yml`);
    const levels = integration ? ["full"] : ["full", "source"];
    for (const coverage of levels) {
      const name = markerName(tree, coverage);
      const response = await get(`/repos/${repository}/actions/artifacts?name=${name}&per_page=20`);
      for (const artifact of (response.artifacts ?? []).slice(0, 5)) {
        const origin = artifact.workflow_run;
        if (artifact.name !== name || artifact.expired !== false
          || !(Date.parse(artifact.expires_at) > Date.now())
          || String(origin?.repository_id) !== repositoryId
          || String(origin?.head_repository_id) !== repositoryId
          || !origin?.id || String(origin.id) === runId) continue;
        const run = await get(`/repos/${repository}/actions/runs/${origin.id}`);
        if (run.id !== origin.id || run.workflow_id !== workflow.id
          || run.status !== "completed" || run.conclusion !== "success"
          || !["push", "pull_request"].includes(run.event)
          || run.repository?.full_name !== repository
          || run.head_repository?.full_name !== repository) continue;
        return { runId: String(run.id), coverage };
      }
    }
  } catch {
    // Expired evidence, API outages and insufficient token permissions all
    // fall back to fresh verification. Never make availability a safety bypass.
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // HEAD is the actual checkout, including the simulated merge commit on PRs.
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim();
  const env = process.env;
  const deadline = AbortSignal.timeout(20000);
  const result = await findVerification({
    tree, integration: env.INTEGRATION !== "false", repository: env.GITHUB_REPOSITORY,
    repositoryId: env.GITHUB_REPOSITORY_ID, runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    get: async (path) => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      });
      if (!response.ok) throw new Error("Verification lookup unavailable");
      return response.json();
    },
  });
  const output = `tree=${tree}\nreused=${Boolean(result)}\nverified_run=${result?.runId ?? ""}\n`;
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, output);
  const message = result
    ? `Reusing successful CI run ${result.runId} for identical source tree ${tree}.`
    : "No reusable verification found; running fresh checks.";
  console.log(message);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
