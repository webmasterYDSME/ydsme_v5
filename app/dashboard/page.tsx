import Link from "next/link";
import { ArrowUpRight, CalendarDays, FileText, Megaphone, Plus, ShoppingBag, Wrench } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireUser, canManageContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createMessage, deleteMessage, joinWorkshop, leaveWorkshop, restoreMessage } from "@/lib/actions/content";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { NewMemberMarquee } from "@/app/components/NewMemberMarquee";
import { safeHttpUrl } from "@/lib/security-input";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [eventsResult, workshopsResult, feedSnapshotResult, docsResult] = await Promise.all([
    supabase.from("events").select("id,name,start_date,start_time,event_type", { count: "exact" }).eq("lifecycle_status", "published").gte("end_date", today).order("start_date").limit(6),
    supabase.from("workshops").select("id,title,date,start_time,venue,maximum_participants", { count: "exact" }).eq("lifecycle_status", "published").gte("date", today).order("date").limit(4),
    supabase.rpc("dashboard_feed_snapshot", { p_limit: 12 }),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("lifecycle_status", "published"),
  ]);
  const events = eventsResult.data ?? [];
  const workshops = workshopsResult.data ?? [];
  if (feedSnapshotResult.error) throw new Error("Unable to load member updates.");
  const feedSnapshot = (feedSnapshotResult.data ?? {}) as unknown as Partial<{
    recent: Array<{ id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string }>;
    latest_document: { id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string } | null;
    latest_message: { id: number; type: string; title: string | null; message: string; url: string | null; author_name: string | null; author_id: string | null; created_at: string } | null;
    latest_user: { id: number; title: string | null; message: string; created_at: string } | null;
  }>;
  const feeds = feedSnapshot.recent ?? [];
  const workshopIds = workshops.map((workshop) => workshop.id);
  const [{ data: ownReservations }, { data: reservationCounts }] = workshopIds.length ? await Promise.all([
    supabase.from("participants").select("reference_id").eq("participant_id", user.id).eq("reservation_status", "reserved").in("reference_id", workshopIds),
    supabase.rpc("workshop_reservation_counts", { p_workshop_ids: workshopIds }),
  ]) : [{ data: [] }, { data: [] }];
  const ownWorkshopIds = new Set((ownReservations ?? []).map((item) => item.reference_id));
  const placesByWorkshop = new Map((reservationCounts ?? []).map((item) => [item.reference_id, Number(item.reserved_count)]));
  const { data: archivedNotices } = await supabase.rpc("own_archived_notices", { p_limit: 10 });
  const featuredFeeds = [
    { label: "Latest document upload", kind: "document", empty: "No documents have been uploaded yet.", feed: feedSnapshot.latest_document },
    { label: "Latest member post", kind: "message", empty: "No member posts have been shared yet.", feed: feedSnapshot.latest_message },
  ];
  const latestNewMember = feedSnapshot.latest_user;
  const featuredFeedIds = new Set([...featuredFeeds.flatMap(({ feed }) => feed ? [feed.id] : []), ...(latestNewMember ? [latestNewMember.id] : [])]);
  const earlierFeeds = feeds.filter(feed => !featuredFeedIds.has(feed.id));

  return <>
    {latestNewMember ? <NewMemberMarquee title={latestNewMember.title || "Welcome our newest member"} message={latestNewMember.message}/> : null}
    <div className="portal-content">
    <header className="portal-heading">
      <div>
        <p className="eyebrow dark">Members’ signal box</p>
        <h1>Good to see you.</h1>
        <p>The live Society board — member-only event dates, documents, workshops and notices.</p>
      </div>
      <Link href="/events" prefetch={false} className="button outline">Public website</Link>
    </header>

    {query.error ? <p className="form-message error">{query.error}</p> : null}
    {query.notice ? <p className="form-message success">Update complete.</p> : null}

    <section className="dashboard-merch-card" aria-labelledby="club-store-heading">
      <span className="dashboard-merch-icon" aria-hidden="true"><ShoppingBag/></span>
      <div>
        <p className="eyebrow">Club shop</p>
        <h2 id="club-store-heading">Wear the Society colours.</h2>
        <p>Browse York Model Engineers clothing and club merchandise at Inglis Works.</p>
      </div>
      <a className="button dashboard-merch-link" href="https://www.inglisworks.co.uk/ysme" target="_blank" rel="noreferrer" aria-label="Visit the York Model Engineers store at Inglis Works (opens in a new tab)">Visit the club store <ArrowUpRight/></a>
    </section>

    <div className="dashboard-section-grid">
      <section className="portal-card dashboard-primary-card" aria-labelledby="upcoming-running-days">
        <div className="card-heading">
          <div><p className="eyebrow dark">Private timetable</p><h2 id="upcoming-running-days">Upcoming running days</h2></div>
          {canManageContent(role) ? <Link href="/admin/events" prefetch={false}>Manage <Plus/></Link> : null}
        </div>
        <div className="compact-list">
          {events.map(event => <article key={event.id}>
            <time dateTime={event.start_date}><strong>{format(parseISO(event.start_date), "dd")}</strong>{format(parseISO(event.start_date), "MMM")}</time>
            <div><h3>{event.name}</h3><p>{event.event_type === "member_only" ? "Members only" : "Public event"} · {event.start_time.slice(0, 5)}</p></div>
          </article>)}
          {!events.length ? <p>No upcoming dates are listed.</p> : null}
        </div>
      </section>

      <section className="portal-card dashboard-latest-card" aria-labelledby="latest-club-update">
        <div className="card-heading">
          <div><p className="eyebrow dark">Notice board</p><h2 id="latest-club-update">Latest from the club</h2></div>
          <Megaphone aria-hidden="true"/>
        </div>
        <div className="dashboard-featured-feeds">
          {featuredFeeds.map(({ label, kind, empty, feed }) => {
            const url = safeHttpUrl(feed?.url);
            return <article className="dashboard-featured-feed dashboard-message-card" data-feed-type={kind} key={label}>
              <div><span>{label}</span>{feed ? <time dateTime={feed.created_at}>{format(new Date(feed.created_at), "d MMM yyyy")}</time> : null}</div>
              {feed ? <>
                <h3>{feed.title || "Club update"}</h3>
                <p>{feed.message}</p>
                {url ? <a href={url} target="_blank" rel="noreferrer">Open attachment →</a> : null}
                {(feed.author_id === user.id || canManageContent(role)) ? <form action={deleteMessage}><input type="hidden" name="id" value={feed.id}/><PendingSubmitButton pendingLabel="Archiving…">Archive</PendingSubmitButton></form> : null}
              </> : <p className="dashboard-empty-note">{empty}</p>}
            </article>;
          })}
        </div>
        {earlierFeeds.length ? <a className="dashboard-jump-link" href="#earlier-updates">Earlier updates ↓</a> : null}
      </section>
    </div>

    <div className="dashboard-section-grid">
      <section className="portal-card" aria-labelledby="workshop-bench">
        <div className="card-heading"><div><p className="eyebrow dark">Workshop bench</p><h2 id="workshop-bench">Learn &amp; make</h2></div></div>
        <div className="workshop-list">
          {workshops.map(workshop => {
            const signedUp = ownWorkshopIds.has(workshop.id);
            const places = placesByWorkshop.get(workshop.id) ?? 0;
            const full = !signedUp && places >= workshop.maximum_participants;
            return <article key={workshop.id}>
              <h3>{workshop.title}</h3>
              <p>{format(parseISO(workshop.date), "d MMM")} · {workshop.start_time.slice(0, 5)}<br/>{workshop.venue}</p>
              <span>{places}/{workshop.maximum_participants} places</span>
              <form action={signedUp ? leaveWorkshop : joinWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton disabled={full} pendingLabel={signedUp ? "Leaving…" : "Reserving…"}>{signedUp ? "Leave workshop" : full ? "Workshop full" : "Reserve place"}</PendingSubmitButton></form>
            </article>;
          })}
          {!workshops.length ? <p>No workshops are currently scheduled.</p> : null}
        </div>
      </section>

      <section className="portal-card dashboard-snapshot" aria-labelledby="society-snapshot">
        <div className="card-heading"><div><p className="eyebrow dark">At a glance</p><h2 id="society-snapshot">Society snapshot</h2></div></div>
        <dl>
          <div><dt><CalendarDays/>Upcoming dates</dt><dd>{eventsResult.count ?? 0}</dd></div>
          <div><dt><Wrench/>Open workshops</dt><dd>{workshopsResult.count ?? 0}</dd></div>
          <div><dt><FileText/>Club documents</dt><dd>{docsResult.count ?? 0}</dd></div>
        </dl>
      </section>
    </div>

    <div className="dashboard-section-grid dashboard-community-grid">
      <section id="earlier-updates" className="portal-card" aria-labelledby="earlier-club-updates">
        <div className="card-heading"><div><p className="eyebrow dark">Notice archive</p><h2 id="earlier-club-updates">Earlier updates</h2></div></div>
        {earlierFeeds.length ? <div className="feed-list">
          {earlierFeeds.map(feed => {
            const url = safeHttpUrl(feed.url);
            return <article className="dashboard-message-card" data-feed-type={feed.type} key={feed.id}>
              <div><span>{feed.type}</span><time dateTime={feed.created_at}>{format(new Date(feed.created_at), "d MMM yyyy")}</time></div>
              <h3>{feed.title || "Club update"}</h3>
              <p>{feed.message}</p>
              {url ? <a href={url} target="_blank" rel="noreferrer">Open attachment →</a> : null}
              {(feed.author_id === user.id || canManageContent(role)) ? <form action={deleteMessage}><input type="hidden" name="id" value={feed.id}/><PendingSubmitButton pendingLabel="Archiving…">Archive</PendingSubmitButton></form> : null}
            </article>;
          })}
        </div> : <p className="dashboard-empty-note">You’re all caught up.</p>}
      </section>

      <section className="portal-card dashboard-compose-card" aria-labelledby="add-member-notice">
        <p className="eyebrow dark">Post to members</p>
        <h2 id="add-member-notice">Add a notice</h2>
        <form action={createMessage} className="stack-form">
          <label>Title<input name="title" maxLength={120} required/></label>
          <label>Message<textarea name="message" rows={5} maxLength={2000} required/></label>
          <PendingSubmitButton className="button dark" pendingLabel="Posting notice…">Post notice</PendingSubmitButton>
        </form>
        {archivedNotices?.length ? <details><summary>Archived notices ({archivedNotices.length})</summary>{archivedNotices.map(notice => <form action={restoreMessage} key={notice.id}><input type="hidden" name="id" value={notice.id}/><span>{notice.title || "Notice"}</span><PendingSubmitButton pendingLabel="Restoring…">Restore</PendingSubmitButton></form>)}</details> : null}
      </section>
    </div>
    </div>
  </>;
}
