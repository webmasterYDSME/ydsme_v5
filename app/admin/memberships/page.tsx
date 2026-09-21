import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { requireCapability } from "@/lib/auth";
import { inboxKinds, kindPillLabel, loadInbox, type InboxKind } from "@/lib/membership-admin/inbox";
import { legacyMembershipRedirect } from "@/lib/membership-admin/legacy-urls";
import { InboxTaskPanel } from "./_components/InboxTaskPanel";
import { MembershipFlash } from "./_components/MembershipFlash";
import styles from "./memberships.module.css";
import { HandbookHelp } from "@/app/components/HandbookHelp";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const pillClass: Record<InboxKind, string> = {
  payment: styles.pillPayment, verify: styles.pillVerify, request: styles.pillRequest, contact: styles.pillContact, problem: styles.pillProblem,
};

function inboxHref(kind: InboxKind | "all", task?: string) {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (task) params.set("task", task);
  const search = params.toString();
  return search ? `/admin/memberships?${search}` : "/admin/memberships";
}

export default async function MembershipInbox({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  // Old addresses (?view=, ?section=, ?member=) are still used by stored links and form actions.
  const legacy = legacyMembershipRedirect(query);
  if (legacy) redirect(legacy);
  await requireCapability("memberships.manage");

  const { tasks } = await loadInbox();
  const requestedKind = one(query.kind);
  const kind: InboxKind | "all" = inboxKinds.some((item) => item.key === requestedKind) ? (requestedKind as InboxKind) : "all";
  const visible = tasks.filter((task) => kind === "all" || task.kind === kind);
  const openTask = tasks.find((task) => task.key === one(query.task)) ?? null;
  const closeHref = inboxHref(kind);
  const chips = [{ key: "all" as const, label: "All" }, ...inboxKinds].map((chip) => ({
    ...chip, count: chip.key === "all" ? tasks.length : tasks.filter((task) => task.kind === chip.key).length,
  }));
  const setupProblems = tasks.some((task) => task.type === "notice" && ["Online payments", "Email", "Setup"].includes(task.area));

  return <>
    <MembershipFlash/>
    <p className={`${styles.tabNote} ${styles.hideOnPhone}`}>Everything that needs an action from membership officer, oldest first. <HandbookHelp chapter="inbox">About the Inbox</HandbookHelp></p>
    <div className={styles.filterBar}>
      <nav className={styles.chips} aria-label="Filter tasks">
        {chips.map((chip) => <Link key={chip.key} className={`${styles.chip} ${chip.key === kind ? styles.chipOn : ""}`} href={inboxHref(chip.key)} prefetch={false} aria-current={chip.key === kind ? "true" : undefined}>{chip.label}<span>{chip.count}</span></Link>)}
      </nav>
      {!setupProblems ? <span className={styles.health}>Online payments and email are working</span> : null}
    </div>
    <section className={styles.taskList} aria-label="Open tasks">
      {visible.map((task) => <article key={task.key} className={`${styles.taskRow} ${openTask?.key === task.key ? styles.taskRowActive : ""}`}>
        <div><span className={`${styles.pill} ${pillClass[task.kind]}`}>{kindPillLabel[task.kind]}</span></div>
        <div className={styles.who}><strong>{task.name}</strong><span>{task.summary}</span></div>
        <div className={styles.waiting}>{task.waiting}</div>
        <Link className="button dark" href={inboxHref(kind, task.key)} prefetch={false} scroll={false}>{task.cta}</Link>
      </article>)}
      {!visible.length ? <div className="membership-empty-state"><UserCheck/><strong>{tasks.length ? "Nothing in this list" : "All caught up"}</strong><p>{tasks.length ? "Choose another filter to see the rest of the Inbox." : "Nothing needs a membership officer right now."}</p></div> : null}
    </section>
    {openTask ? <InboxTaskPanel key={openTask.key} task={openTask} closeHref={closeHref}/> : null}
  </>;
}
