import Link from "next/link";
import { ArrowUpRight, BookOpen, ChevronDown, FileText, Hammer, Megaphone, Plus, ShoppingBag } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireUser, canManageContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteMessage, joinWorkshop, leaveWorkshop, restoreMessage } from "@/lib/actions/content";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { NewMemberMarquee } from "@/app/components/NewMemberMarquee";
import { safeHttpUrl } from "@/lib/security-input";
import { calendarHref } from "@/lib/calendar-link";
import { membershipAdministrationEnabled, membershipBillingEnabled, MEMBERMOJO_MEMBERSHIP_URL } from "@/lib/features";
import { getMembershipAccount, getOpenMembershipRenewalCampaign, type MembershipAccount } from "@/lib/membership";
import { AttentionStrip } from "./_components/AttentionStrip";
import { NoticeComposer } from "./_components/NoticeComposer";
import { PersonalStrip, type StripTile } from "./_components/PersonalStrip";
import { loadAttention } from "./attention";
import { firstNameOf, greetingFor, londonHour, membershipTile, nextReservedWorkshop } from "./personal";
import styles from "./dashboard.module.css";
import { ProjectCard } from "@/app/dashboard/workbench/ProjectCard";
import {
  getDashboardSharedSnapshot,
  getMemberDocumentCounts,
  getWorkshopReservationCounts,
} from "@/lib/dashboard-data";
import { getWorkbenchProjects } from "@/lib/workbench";

export const dynamic = "force-dynamic";

// Notices shown on the board: the newest few, with the rest one tap away.
const NOTICE_LIMIT = 9;
const NOTICES_SHOWN = 3;
// Long notices show a short preview until the member chooses to read the rest.
const NOTICE_PREVIEW_CHARS = 240;

const dashboardNotices: Record<string, { message: string; tone: "success" | "error" }> = {
  "password-updated": { message: "Your password was updated.", tone: "success" },
  "not-authorised": { message: "You do not have permission to open that page.", tone: "error" },
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role, fullName, membershipOfficer }, query] = await Promise.all([requireUser(), searchParams]);
  const notice = query.notice ? dashboardNotices[query.notice] : undefined;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const membershipEnabled = membershipBillingEnabled();
  const [sharedSnapshot, documentCounts, feedSnapshotResult, noticesResult, workbenchProjects, ownProjects, membership, campaign, attention] = await Promise.all([
    getDashboardSharedSnapshot(today),
    getMemberDocumentCounts(),
    // The snapshot now only supplies the newest upload and new member; the notice board reads member posts itself.
    supabase.rpc("dashboard_feed_snapshot", { p_limit: 1 }),
    supabase.from("feeds").select("id,title,message,url,author_name,author_id,created_at").eq("type", "message").eq("lifecycle_status", "published").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(NOTICE_LIMIT),
    getWorkbenchProjects({ userId: user.id, limit: 3 }),
    getWorkbenchProjects({ userId: user.id, scope: "mine", limit: 3 }),
    // A fault while reading the membership record hides that tile; it must not stop the dashboard opening.
    membershipEnabled ? getMembershipAccount(user.id).catch(() => undefined) : Promise.resolve(null),
    membershipEnabled ? getOpenMembershipRenewalCampaign().catch(() => null) : Promise.resolve(null),
    membershipOfficer && membershipAdministrationEnabled() ? loadAttention() : Promise.resolve(null),
  ]);
  const events = sharedSnapshot.events;
  const workshops = sharedSnapshot.workshops;
  if (feedSnapshotResult.error || noticesResult.error) throw new Error("Unable to load member updates.");
  const notices = noticesResult.data ?? [];
  const feedSnapshot = (feedSnapshotResult.data ?? {}) as unknown as Partial<{
    recent: Array<{ id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string }>;
    latest_document: { id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string } | null;
    latest_message: { id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string } | null;
    latest_user: { id: number; title: string | null; message: string; created_at: string } | null;
  }>;
  const workshopIds = workshops.map((workshop) => workshop.id);
  const [{ data: ownReservations }, reservationCounts, { data: archivedNotices }] = await Promise.all([
    workshopIds.length
      ? supabase.from("participants").select("reference_id").eq("participant_id", user.id).eq("reservation_status", "reserved").in("reference_id", workshopIds)
      : Promise.resolve({ data: [] }),
    getWorkshopReservationCounts(workshopIds),
    supabase.rpc("own_archived_notices", { p_limit: 10 }),
  ]);
  const ownWorkshopIds = new Set((ownReservations ?? []).map((item) => item.reference_id));
  const placesByWorkshop = new Map(reservationCounts.map((item) => [item.reference_id, item.reserved_count]));
  const canManage = canManageContent(role);
  const latestNewMember = feedSnapshot.latest_user;
  const latestDocument = feedSnapshot.latest_document;

  const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entry";
  const renderNotice = (notice: (typeof notices)[number]) => {
    const url = safeHttpUrl(notice.url);
    return <article className="dashboard-featured-feed dashboard-message-card" data-feed-type="message" key={notice.id}>
      <div><span>{notice.author_name || "A member"}</span><time dateTime={notice.created_at}>{format(new Date(notice.created_at), "d MMM yyyy")}</time></div>
      <h3>{notice.title || "Club update"}</h3>
      {notice.message.length > NOTICE_PREVIEW_CHARS
        ? <details className={styles.readMore}>
            <summary><em className={styles.preview}>{notice.message.slice(0, NOTICE_PREVIEW_CHARS).trimEnd()}…</em><strong className={styles.readMoreOpen}>Read the full notice</strong><strong className={styles.readMoreClose}>Show less</strong></summary>
            <p>{notice.message}</p>
          </details>
        : <p>{notice.message}</p>}
      {url ? <a href={url} target="_blank" rel="noreferrer">Open attachment →</a> : null}
      {(notice.author_id === user.id || canManage) ? <form action={deleteMessage}><input type="hidden" name="id" value={notice.id}/><PendingSubmitButton pendingLabel="Archiving…">Archive</PendingSubmitButton></form> : null}
    </article>;
  };
  const renderEvent = (event: (typeof events)[number]) => <article key={event.id}>
    <time dateTime={event.start_date}><strong>{format(parseISO(event.start_date), "dd")}</strong>{format(parseISO(event.start_date), "MMM")}</time>
    <div>
      <h3>{event.name}</h3>
      <p>{event.event_type === "member_only" ? "Members only" : "Public event"} · {event.start_time.slice(0, 5)}{event.end_time ? `–${event.end_time.slice(0, 5)}` : ""}</p>
      <details className={styles.more}>
        <summary>Details</summary>
        <div className={styles.moreBody}>
          {event.descriptions ? <p>{event.descriptions}</p> : <p>No further details have been added yet.</p>}
          <a className={styles.moreLink} download={`${slug(event.name)}.ics`} href={calendarHref({
            uid: `event-${event.id}`, title: event.name, description: event.descriptions, startDate: event.start_date, startTime: event.start_time,
            endDate: event.end_date, endTime: event.end_time,
          })}>Add to calendar</a>
        </div>
      </details>
    </div>
  </article>;

  const renderWorkshop = (workshop: (typeof workshops)[number]) => {
    const signedUp = ownWorkshopIds.has(workshop.id);
    const places = placesByWorkshop.get(workshop.id) ?? 0;
    const full = !signedUp && places >= workshop.maximum_participants;
    const virtualLink = safeHttpUrl(workshop.virtual_link);
    return <article key={workshop.id}>
      <h3>{workshop.title}{signedUp ? <em className={styles.booked}>You’re booked</em> : null}</h3>
      <p>{format(parseISO(workshop.date), "d MMM")} · {workshop.start_time.slice(0, 5)}<br/>{workshop.venue}</p>
      <span>{places}/{workshop.maximum_participants} places</span>
      <details className={styles.more}>
        <summary>Details</summary>
        <div className={styles.moreBody}>
          {workshop.descriptions ? <p>{workshop.descriptions}</p> : <p>No further details have been added yet.</p>}
          {workshop.host_name || workshop.notes || virtualLink ? <dl>
            {workshop.host_name ? <div><dt>Led by</dt><dd>{workshop.host_name}</dd></div> : null}
            {workshop.notes ? <div><dt>Notes</dt><dd>{workshop.notes}</dd></div> : null}
            {virtualLink ? <div><dt>Online</dt><dd><a href={virtualLink} target="_blank" rel="noreferrer">Join link</a></dd></div> : null}
          </dl> : null}
          <a className={styles.moreLink} download={`${slug(workshop.title)}.ics`} href={calendarHref({
            uid: `workshop-${workshop.id}`, title: workshop.title, description: workshop.descriptions, location: workshop.venue,
            startDate: workshop.date, startTime: workshop.start_time, endDate: workshop.date, endTime: workshop.end_time,
          })}>Add to calendar</a>
        </div>
      </details>
      <form action={signedUp ? leaveWorkshop : joinWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton disabled={full} pendingLabel={signedUp ? "Leaving…" : "Reserving…"}>{signedUp ? "Leave workshop" : full ? "Workshop full" : "Reserve place"}</PendingSubmitButton></form>
    </article>;
  };

  // The personal strip: where the member stands, what is new for them, and what they have on.
  const firstName = firstNameOf(fullName);
  const nextEvent = events[0];
  const bookedWorkshop = nextReservedWorkshop(workshops, ownWorkshopIds);
  const nextOpenWorkshop = workshops[0];
  const ownProject = ownProjects[0];
  const stripTiles: StripTile[] = [];
  if (!membershipEnabled) {
    stripTiles.push({
      key: "membership", label: "Your membership", external: true,
      tile: { tone: "quiet", headline: "Managed on MemberMojo", detail: "Applications, renewals and payment details are handled there.", action: { label: "Manage membership", href: MEMBERMOJO_MEMBERSHIP_URL } },
    });
  } else if (membership !== undefined) {
    const renewalAvailable = Boolean(campaign && !membership?.history.some((term) => term.membership_year === campaign.membership_year && term.status === "paid"));
    stripTiles.push({
      key: "membership", label: "Your membership",
      tile: membershipTile({
        membership: membership as MembershipAccount | null, campaignYear: campaign?.membership_year ?? null, renewalAvailable,
        honoraryTransitionPayment: Boolean(membership?.member.effective_state === "honorary" && membership.honorary?.revoked_effective_on && membership.honorary.replacement_plan_id),
      }),
    });
  }
  stripTiles.push({
    key: "running-day", label: "Next running day",
    tile: nextEvent
      ? { tone: "good", headline: format(parseISO(nextEvent.start_date), "EEE d MMM"), detail: `${nextEvent.start_time.slice(0, 5)}${nextEvent.end_time ? `–${nextEvent.end_time.slice(0, 5)}` : ""} · ${nextEvent.event_type === "member_only" ? "Members only" : "Public event"}`, action: { label: "See running days", href: "#upcoming-running-days" } }
      : { tone: "quiet", headline: "None listed yet", detail: "Dates appear here as soon as the committee publishes them.", action: canManage ? { label: "Add a date", href: "/admin/events" } : null },
  });
  stripTiles.push({
    key: "workshop", label: "Your next workshop",
    tile: bookedWorkshop
      ? { tone: "good", headline: bookedWorkshop.title, detail: `${format(parseISO(bookedWorkshop.date), "EEEE d MMMM")} at ${bookedWorkshop.start_time.slice(0, 5)}, ${bookedWorkshop.venue}.`, action: { label: "See workshops", href: "#workshops" } }
      : { tone: "quiet", headline: "Nothing booked", detail: nextOpenWorkshop ? `Next up: ${nextOpenWorkshop.title} on ${format(parseISO(nextOpenWorkshop.date), "d MMMM")}.` : "No workshops are scheduled yet.", action: nextOpenWorkshop ? { label: "Browse workshops", href: "#workshops" } : null },
  });
  stripTiles.push({
    key: "projects", label: "Your projects",
    tile: ownProject
      ? { tone: "good", headline: ownProjects.length === 1 ? ownProject.title : `${ownProjects.length} projects`, detail: ownProject.latest_update ? `Latest update: ${ownProject.latest_update.title}.` : "No updates posted yet. Share how it is going.", action: { label: "Open your workbench", href: "/dashboard/workbench" } }
      : { tone: "quiet", headline: "No projects yet", detail: "Share what you are building with the rest of the Society.", action: { label: "Start a project", href: "/dashboard/workbench/new" } },
  });

  const documentLinks = [
    { href: "/dashboard/minutes", label: "Committee minutes", count: documentCounts.minutes },
    { href: "/dashboard/publications", label: "Society publications", count: documentCounts.publications },
    { href: "/dashboard/resources", label: "Member resources", count: documentCounts.resources },
  ];

  return <>
    {latestNewMember ? <NewMemberMarquee title={latestNewMember.title || "Welcome our newest member"} message={latestNewMember.message}/> : null}
    <div className="portal-content">
    <div className={styles.page}>
    <header className="portal-heading dashboard-heading">
      <div>
        <p className="eyebrow dark">Members’ signal box</p>
        <h1>{greetingFor(londonHour())}{firstName ? `, ${firstName}` : ""}.</h1>
        <p>Here is what is happening at the Society.</p>
      </div>
      <Link href="/events" prefetch={false} className="button outline dashboard-public-link"><span>Public website</span><ArrowUpRight aria-hidden="true"/></Link>
    </header>

    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {notice ? <p className={`form-message ${notice.tone}`}>{notice.message}</p> : null}

    {attention ? <AttentionStrip summary={attention}/> : null}
    <PersonalStrip tiles={stripTiles}/>

    <div className={styles.columns}>
      <div className={styles.column}>
      <section className={`portal-card dashboard-primary-card ${styles.orderEvents}`} aria-labelledby="upcoming-running-days">
        <div className="card-heading">
          <div><p className="eyebrow dark">Members’ calendar</p><h2 id="upcoming-running-days">Upcoming running days</h2></div>
          {canManage ? <Link href="/admin/events" prefetch={false}>Manage <Plus/></Link> : null}
        </div>
        <div className="compact-list">
          {events.slice(0, 3).map(renderEvent)}
        </div>
        {!events.length ? <div className={styles.empty}>
          <p>No running days are listed yet.</p>
          {canManage ? <Link href="/admin/events" prefetch={false}>Add a date</Link> : <span>Dates appear here as soon as the committee publishes them.</span>}
        </div> : null}
        {events.length > 3 ? <details className="dashboard-more-list"><summary>Show {events.length - 3} more dates <ChevronDown aria-hidden="true"/></summary><div className="compact-list">{events.slice(3).map(renderEvent)}</div></details> : null}
      </section>

      <section className={`portal-card ${styles.orderWorkshops}`} id="workshops" aria-labelledby="workshop-bench">
        <div className="card-heading">
          <div><p className="eyebrow dark">Workshop bench</p><h2 id="workshop-bench">Workshops</h2></div>
          {canManage ? <Link href="/admin/workshops" prefetch={false}>Manage <Plus/></Link> : null}
        </div>
        <div className="workshop-list">
          {workshops.slice(0, 2).map(renderWorkshop)}
        </div>
        {!workshops.length ? <div className={styles.empty}>
          <p>No workshops are scheduled yet.</p>
          {canManage ? <Link href="/admin/workshops" prefetch={false}>Add a workshop</Link> : <span>New workshops appear here, and you can reserve a place in one tap.</span>}
        </div> : null}
        {workshops.length > 2 ? <details className="dashboard-more-list"><summary>Show {workshops.length - 2} more workshops <ChevronDown aria-hidden="true"/></summary><div className="workshop-list">{workshops.slice(2).map(renderWorkshop)}</div></details> : null}
      </section>

      </div>
      <div className={styles.column}>
      <section className={`portal-card dashboard-latest-card ${styles.orderBoard}`} aria-labelledby="latest-club-update">
        <div className="card-heading">
          <div><p className="eyebrow dark">Notice board</p><h2 id="latest-club-update">Latest from the club</h2></div>
          <Megaphone aria-hidden="true"/>
        </div>
        <NoticeComposer first={!notices.length}/>
        {notices.length ? <div className="dashboard-featured-feeds">{notices.slice(0, NOTICES_SHOWN).map(renderNotice)}</div>
          : <p className={`dashboard-empty-note ${styles.noticeEmpty}`}>No member notices yet. Be the first to share something with the Society.</p>}
        {notices.length > NOTICES_SHOWN ? <details className="dashboard-more-list"><summary>Show {notices.length - NOTICES_SHOWN} earlier notices <ChevronDown aria-hidden="true"/></summary><div className="dashboard-featured-feeds">{notices.slice(NOTICES_SHOWN).map(renderNotice)}</div></details> : null}
        {archivedNotices?.length ? <details className={styles.archived}><summary>Your archived notices ({archivedNotices.length})</summary>{archivedNotices.map(notice => <form action={restoreMessage} key={notice.id}><input type="hidden" name="id" value={notice.id}/><span>{notice.title || "Notice"}</span><PendingSubmitButton pendingLabel="Restoring…">Restore</PendingSubmitButton></form>)}</details> : null}
      </section>
      <section className={`portal-card ${styles.orderLibrary}`} aria-labelledby="society-library">
        <div className="card-heading">
          <div><p className="eyebrow dark">Documents</p><h2 id="society-library">Society library</h2></div>
          <BookOpen aria-hidden="true"/>
        </div>
        <ul className={styles.libraryList}>
          {documentLinks.map((item) => <li key={item.href}><Link href={item.href} prefetch={false}><FileText aria-hidden="true"/>{item.label}<span>{item.count}</span></Link></li>)}
        </ul>
        <div className={styles.latestUpload}>
          <p className="eyebrow dark">Latest upload</p>
          {latestDocument ? <>
            {safeHttpUrl(latestDocument.url) ? <a href={safeHttpUrl(latestDocument.url) ?? undefined} target="_blank" rel="noreferrer">{latestDocument.title || "New document"}</a> : <strong>{latestDocument.title || "New document"}</strong>}
            <time dateTime={latestDocument.created_at}>{format(new Date(latestDocument.created_at), "d MMM yyyy")}</time>
          </> : <>
            <span>No documents have been uploaded yet.</span>
            {canManage ? <Link href="/dashboard/library" prefetch={false}>Upload a document</Link> : null}
          </>}
        </div>
      </section>
      </div>
    </div>

    <section className="dashboard-workbench" aria-labelledby="dashboard-workbench-heading">
      <header>
        <div><p className="eyebrow dark">From members’ benches</p><h2 id="dashboard-workbench-heading">Projects taking shape</h2><p>See the latest builds, restorations and requests for help from across the Society.</p></div>
        <Link href="/dashboard/workbench" prefetch={false}>Open Project Workbench <ArrowUpRight/></Link>
      </header>
      {workbenchProjects.length ? <div className="workbench-project-grid dashboard-workbench-grid">{workbenchProjects.map((project) => <ProjectCard project={project} key={project.id}/>)}</div> : <div className="dashboard-workbench-empty"><Hammer/><div><strong>The benches are ready.</strong><p>Start the first member project journal.</p></div><Link href="/dashboard/workbench/new" className="button dark">Start a project</Link></div>}
    </section>

    <section className={`dashboard-merch-card ${styles.merch}`} aria-labelledby="club-store-heading">
      <span className="dashboard-merch-icon" aria-hidden="true"><ShoppingBag/></span>
      <div>
        <p className="eyebrow">Club shop</p>
        <h2 id="club-store-heading">Wear the Society colours.</h2>
        <p>Browse York Model Engineers clothing and club merchandise at Inglis Works.</p>
      </div>
      <a className="button dashboard-merch-link" href="https://www.inglisworks.co.uk/ysme" target="_blank" rel="noreferrer" aria-label="Visit the York Model Engineers store at Inglis Works (opens in a new tab)"><span>Visit the club store</span><ArrowUpRight/></a>
    </section>
    </div>
    </div>
  </>;
}
