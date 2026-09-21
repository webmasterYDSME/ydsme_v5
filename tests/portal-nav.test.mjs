import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchMembers } from "../lib/membership-admin/member-search.ts";
import { attentionCount, buildPortalNav, initials, itemIsCurrent, navItems, roleLabel, searchPages } from "../lib/portal-nav.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const base = { canViewContent: false, administrator: false, membershipOfficer: false, membershipEnabled: true, membershipTaskCount: 0 };
const labels = (sections) => sections.map((section) => [section.label, section.items.map((item) => item.label)]);

test("gives a plain member only Overview and the members' area", () => {
  assert.deepEqual(labels(buildPortalNav({ ...base, role: "member" })), [
    [null, ["Overview"]],
    ["Members\u2019 area", ["Project workbench", "Society library"]],
  ]);
});

test("puts a committee member's work ahead of the members' area", () => {
  const sections = buildPortalNav({ ...base, role: "committee", canViewContent: true });
  assert.deepEqual(labels(sections), [
    [null, ["Overview"]],
    ["Membership and money", ["Website accounts"]],
    ["Website", ["Announcements", "Events", "Visitor bookings", "Workshops"]],
    ["Members\u2019 area", ["Project workbench", "Society library"]],
  ]);
});

test("adds Memberships and Donations for a membership officer, with the task count", () => {
  const sections = buildPortalNav({ ...base, role: "committee", canViewContent: true, membershipOfficer: true, membershipTaskCount: 8 });
  assert.deepEqual(labels(sections)[1], ["Membership and money", ["Memberships", "Website accounts", "Donations", "Officer handbook"]]);
  assert.equal(navItems(sections).find((item) => item.key === "memberships")?.count, 8);
  assert.equal(attentionCount(sections), 8);
});

test("hides Memberships while membership administration is off, but keeps Donations", () => {
  const sections = buildPortalNav({ ...base, role: "committee", canViewContent: true, membershipOfficer: true, membershipEnabled: false, membershipTaskCount: 5 });
  assert.deepEqual(labels(sections)[1], ["Membership and money", ["Website accounts", "Donations", "Officer handbook"]]);
  assert.equal(attentionCount(sections), 0);
});

test("shows an administrator everything, with Administration last", () => {
  const sections = buildPortalNav({ ...base, role: "administrator", canViewContent: true, administrator: true, membershipOfficer: true });
  assert.deepEqual(sections.map((section) => section.label), [null, "Membership and money", "Website", "Members\u2019 area", "Administration"]);
  assert.deepEqual(sections.at(-1)?.items.map((item) => item.label), ["Site settings", "Email queue", "Important changes"]);
});

test("never repeats a link or an address", () => {
  const items = navItems(buildPortalNav({ ...base, role: "administrator", canViewContent: true, administrator: true, membershipOfficer: true }));
  assert.equal(new Set(items.map((item) => item.key)).size, items.length);
  assert.equal(new Set(items.map((item) => item.href)).size, items.length);
});

test("marks the current item, including sub-pages and alternate paths", () => {
  const items = navItems(buildPortalNav({ ...base, role: "administrator", canViewContent: true, administrator: true, membershipOfficer: true }));
  const current = (pathname) => items.filter((item) => itemIsCurrent(pathname, item)).map((item) => item.key);
  assert.deepEqual(current("/dashboard"), ["overview"]);
  assert.deepEqual(current("/dashboard/workbench/abc"), ["workbench"]);
  assert.deepEqual(current("/dashboard/minutes"), ["library"]);
  assert.deepEqual(current("/admin/memberships/members/abc"), ["memberships"]);
  assert.deepEqual(current("/admin/members"), ["accounts"]);
  assert.deepEqual(current("/admin/people"), ["accounts"]);
  assert.deepEqual(current("/account"), []);
});

test("describes the signed-in person's role in words", () => {
  assert.equal(roleLabel("member", false), "Member");
  assert.equal(roleLabel("committee", false), "Committee member");
  assert.equal(roleLabel("committee", true), "Membership officer");
  assert.equal(roleLabel("administrator", true), "Administrator");
});

test("builds avatar initials from a name or an email address", () => {
  assert.equal(initials("Alex Sample"), "AS");
  assert.equal(initials("  mary   ann  jones "), "MJ");
  assert.equal(initials("alex@example.test"), "A");
  assert.equal(initials(""), "?");
});

test("searches pages by every word typed and suggests a few when empty", () => {
  const items = navItems(buildPortalNav({ ...base, role: "administrator", canViewContent: true, administrator: true, membershipOfficer: true }));
  assert.equal(searchPages(items, "").length, 5);
  assert.deepEqual(searchPages(items, "visitor").map((item) => item.label), ["Visitor bookings"]);
  assert.deepEqual(searchPages(items, "  SITE set ").map((item) => item.label), ["Site settings"]);
  assert.deepEqual(searchPages(items, "zzz"), []);
});

test("matches members by name or email, ranking names that start with the first word", () => {
  const members = [
    { id: "1", fullName: "Peter Ashworth", email: "p.ashworth@example.org" },
    { id: "2", fullName: "Margaret Holloway", email: "m.holloway@example.org" },
    { id: "3", fullName: "Holly Ash", email: null },
    { id: "4", fullName: "Sam Reed", email: "holly.ash.family@example.org" },
  ];
  assert.deepEqual(matchMembers(members, "ash").map((member) => member.id), ["3", "1", "4"]);
  assert.deepEqual(matchMembers(members, "holly ash").map((member) => member.id), ["3", "4"]);
  assert.deepEqual(matchMembers(members, "MARG holl").map((member) => member.id), ["2"]);
  assert.deepEqual(matchMembers(members, "a"), [], "one character would match almost everyone");
  assert.deepEqual(matchMembers(members, "   "), []);
  assert.equal(matchMembers(members, "example", 2).length, 2);
});

test("keeps member search behind the membership officer check and out of the client bundle", async () => {
  const [action, search, shell, navigation] = await Promise.all([
    read("lib/actions/portal-search.ts"),
    read("app/components/PortalSearch.tsx"),
    read("app/components/PortalShell.tsx"),
    read("app/components/PortalNavigation.tsx"),
  ]);
  assert.match(action, /^"use server";/);
  assert.match(action, /requireUser\(\)[\s\S]*if \(!session\.membershipOfficer \|\| !membershipAdministrationEnabled\(\)\) return \[\]/);
  assert.match(search, /searchMembersForPortal/);
  assert.match(shell, /canSearchMembers=\{membershipOfficer && membershipEnabled\}/);
  assert.match(shell, /cookieStore\.get\(portalSidebarCookie\)/);
  assert.match(navigation, /task needs/);
  assert.match(navigation, /Collapse sidebar/);
});
