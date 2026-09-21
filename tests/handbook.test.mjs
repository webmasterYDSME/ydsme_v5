import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { blockTexts, inlineTokens, linksIn, plainText, searchHandbook } from "../lib/handbook/text.ts";

const root = new URL("../", import.meta.url);
const chapterDirectory = new URL("lib/handbook/chapters/", root);
const files = readdirSync(chapterDirectory).filter((file) => file.endsWith(".ts")).sort();

const chapters = [];
for (const file of files) {
  const loaded = await import(new URL(file, chapterDirectory).href);
  const exported = Object.values(loaded);
  assert.equal(exported.length, 1, `${file} should export exactly one chapter`);
  chapters.push({ file, chapter: exported[0] });
}
const all = chapters.map((item) => item.chapter);

/** The routes that exist, from the app folder: a link may only point at a page that is really there. */
function routeExists(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const visit = (directory, index) => {
    if (index === parts.length) return existsSync(new URL("page.tsx", directory)) || existsSync(new URL("route.ts", directory));
    const entries = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const exact = entries.find((entry) => entry.name === parts[index]);
    if (exact && visit(new URL(`${exact.name}/`, directory), index + 1)) return true;
    return entries.filter((entry) => /^\[[^\]]+\]$/.test(entry.name)).some((entry) => visit(new URL(`${entry.name}/`, directory), index + 1));
  };
  return visit(new URL("app/", root), 0);
}

test("every handbook chapter is complete and listed in the handbook", () => {
  const index = readFileSync(new URL("lib/handbook/index.ts", root), "utf8");
  const slugs = new Set();
  for (const { file, chapter } of chapters) {
    assert.match(chapter.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${file}: slug`);
    assert.ok(!slugs.has(chapter.slug), `${file}: duplicate slug ${chapter.slug}`);
    slugs.add(chapter.slug);
    assert.ok(chapter.title.length > 2 && chapter.summary.length > 20, `${file}: title and summary`);
    assert.ok(["officer", "administrator", "everyone"].includes(chapter.audience), `${file}: audience`);
    assert.match(chapter.reviewed, /^\d{4}-\d{2}-\d{2}$/, `${file}: reviewed date`);
    assert.ok(new Date(`${chapter.reviewed}T12:00:00Z`).getTime() <= Date.now() + 86_400_000, `${file}: reviewed date is in the future`);
    assert.ok(chapter.sections.length > 0, `${file}: has sections`);
    const ids = new Set();
    for (const section of chapter.sections) {
      assert.match(section.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${file}: section id ${section.id}`);
      assert.ok(!ids.has(section.id), `${file}: duplicate section ${section.id}`);
      ids.add(section.id);
      assert.ok(section.blocks.length > 0, `${file}: ${section.id} is empty`);
    }
    assert.ok(index.includes(`./chapters/${file.replace(/\.ts$/, "")}`), `${file} is not listed in lib/handbook/index.ts`);
  }
});

test("handbook text is well formed and every block is a known kind", () => {
  for (const { file, chapter } of chapters) {
    for (const section of chapter.sections) {
      for (const block of section.blocks) {
        assert.ok(["p", "steps", "list", "note", "table"].includes(block.type), `${file}: unknown block ${block.type}`);
        if (block.type === "table") {
          for (const row of block.rows) assert.equal(row.length, block.head.length, `${file}/${section.id}: a table row has the wrong number of cells`);
        }
        if (block.type === "steps" || block.type === "list") assert.ok(block.items.length > 0, `${file}/${section.id}: empty list`);
        for (const text of blockTexts(block)) {
          assert.equal((text.match(/\*\*/g) ?? []).length % 2, 0, `${file}/${section.id}: unbalanced ** in: ${text.slice(0, 60)}`);
          assert.equal((text.match(/`/g) ?? []).length % 2, 0, `${file}/${section.id}: unbalanced backtick in: ${text.slice(0, 60)}`);
          assert.ok(!/<[a-z][^>]*>/i.test(text), `${file}/${section.id}: HTML in text: ${text.slice(0, 60)}`);
        }
      }
    }
  }
});

test("every link in the handbook points at a page or a handbook section that exists", () => {
  const chapterBySlug = new Map(all.map((chapter) => [chapter.slug, chapter]));
  let checked = 0;
  for (const { file, chapter } of chapters) {
    for (const section of chapter.sections) {
      for (const text of section.blocks.flatMap(blockTexts)) {
        for (const href of linksIn(text)) {
          checked += 1;
          assert.match(href, /^\/[a-z0-9/-]*(\?[^\s#]*)?(#[a-z0-9-]+)?$/i, `${file}/${section.id}: ${href} is not an address inside the site`);
          const [pathAndQuery, hash] = href.split("#");
          const pathname = pathAndQuery.split("?")[0];
          assert.ok(routeExists(pathname), `${file}/${section.id}: no page at ${pathname}`);
          const handbook = pathname.match(/^\/admin\/handbook\/([a-z0-9-]+)$/);
          if (handbook && handbook[1] !== "all") {
            const target = chapterBySlug.get(handbook[1]);
            assert.ok(target, `${file}/${section.id}: no chapter ${handbook[1]}`);
            if (hash) assert.ok(target.sections.some((item) => item.id === hash), `${file}/${section.id}: ${handbook[1]} has no section ${hash}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 20, "the handbook should link to the screens it describes");
});

test("inline text is split into plain, bold, code and link pieces", () => {
  assert.deepEqual(inlineTokens("Press **Save** in `Setup` or see [Renewals](/admin/memberships/renewals)."), [
    { kind: "text", text: "Press " }, { kind: "bold", text: "Save" }, { kind: "text", text: " in " }, { kind: "code", text: "Setup" },
    { kind: "text", text: " or see " }, { kind: "link", text: "Renewals", href: "/admin/memberships/renewals" }, { kind: "text", text: "." },
  ]);
  assert.equal(plainText("A **bold** [link](/x) and `code`"), "A bold link and code");
  assert.deepEqual(linksIn("[a](/one) and [b](/two#three)"), ["/one", "/two#three"]);
});

test("search finds sections that contain every word and ranks title matches first", () => {
  const hits = searchHandbook(all, "lapsed link");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.snippet.length > 0));
  const best = searchHandbook(all, "reminders");
  assert.equal(best[0].sectionId, "reminders");
  assert.equal(searchHandbook(all, "").length, 0);
  assert.equal(searchHandbook(all, "zzzzqqqq").length, 0);
  assert.equal(searchHandbook(all, "cheque  received").every((hit) => hit.chapterSlug.length > 0), true);
});

test("the handbook covers the features an officer is expected to use", () => {
  const text = all.map((chapter) => chapter.sections.flatMap((section) => section.blocks.flatMap(blockTexts)).join(" ")).join(" ").toLowerCase();
  for (const phrase of [
    "send reminder", "send new renewal link", "send invitations", "open renewals", "part-year fee", "record payment", "mark as contacted",
    "make honorary", "fees and types", "change fee", "email queue", "membermojo", "archived", "grace", "lapsed", "retention", "prepare records download",
  ]) assert.ok(text.includes(phrase), `the handbook never mentions “${phrase}”`);
});

test("the handbook is reachable: linked from the sidebar, restricted to officers, and mentioned where the screens are", () => {
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  assert.match(read("lib/portal-nav.ts"), /key: "handbook", href: "\/admin\/handbook"/);
  assert.match(read("app/components/PortalNavigation.tsx"), /handbook: BookMarked/);
  assert.match(read("app/admin/handbook/layout.tsx"), /if \(!session\.membershipOfficer\) redirect/);
  for (const page of [
    "app/admin/memberships/renewals/page.tsx", "app/admin/memberships/page.tsx", "app/admin/memberships/members/page.tsx",
    "app/admin/memberships/members/[id]/page.tsx", "app/admin/memberships/setup/page.tsx", "app/administrator/member-import/page.tsx",
    "app/administrator/email-queue/page.tsx",
  ]) assert.match(read(page), /HandbookHelp/, `${page} should link to the handbook`);
});
