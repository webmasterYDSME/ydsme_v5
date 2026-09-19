import { readdir, readFile } from "node:fs/promises";

/** The account page and the section components it is built from, as one string, for tests that check what the page contains. */
export async function readAccountSource() {
  const root = new URL("../app/account/", import.meta.url);
  const components = (await readdir(new URL("_components/", root))).filter((name) => name.endsWith(".tsx")).sort();
  const files = ["page.tsx", ...components.map((name) => `_components/${name}`)];
  return (await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8")))).join("\n");
}
