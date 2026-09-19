import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../app/admin/memberships/", import.meta.url);

/**
 * The membership workspace is split across routes and components. Source-contract tests read all of
 * it as one text so they keep asserting what the officer screens say and do, wherever it now lives.
 */
export async function readMembershipAdminSource() {
  const files = [];
  const walk = async (folder) => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), folder);
      if (entry.isDirectory()) await walk(child);
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(child);
    }
  };
  await walk(directory);
  files.sort((a, b) => a.href.localeCompare(b.href));
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}
