import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Archive, CalendarDays, Download, MailCheck, Megaphone, Pencil, Plus, RotateCcw, Search, Trash2, UserPlus, UsersRound, UserX, Wrench } from "lucide-react";
import { hasCapability, requireUser } from "@/lib/auth";
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin";
import {
  cancelWorkshopReservation,
  archiveAnnouncement,
  deleteOldArchivedAnnouncements,
  deleteEvent,
  deleteMember,
  deleteWorkshop,
  inviteMember,
  purgeMember,
  restoreEvent,
  restoreAnnouncement,
  restoreMember,
  restoreWorkshop,
  retryWorkshopReservationEmail,
  saveAnnouncement,
  saveWorkshop,
  suspendMember,
  updateMemberRole,
} from "@/lib/actions/content";
import { safeSearchTerm } from "@/lib/security-input";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { AnnouncementFields } from "@/app/components/AnnouncementFields";
import { EventEditorDialog, type EventEditorRecord } from "@/app/components/EventEditorDialog";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";
import { eventImage } from "@/lib/data";
import { membershipAdministrationEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const ANNOUNCEMENT_PAGE_SIZE = 12;
const EVENT_PAGE_SIZE = 12;
const WORKSHOP_PAGE_SIZE = 5;

type LifecycleStatus = "published" | "draft" | "cancelled" | "archived";
type EventRow = EventEditorRecord;
type AnnouncementRow = { id:number; title:string; body:string; lifecycle_status:string; published_at:string|null; updated_at:string };
type WorkshopRow = { id:string; title:string; descriptions:string; notes:string; date:string; start_time:string; end_time:string; host_name:string; venue:string; virtual_link:string; maximum_participants:number; lifecycle_status:LifecycleStatus; updated_at:string };
type Query = { error?: string; notice?: string; q?: string; status?: string; page?: string };

function AnnouncementForm({ announcement }: { announcement?: AnnouncementRow }) {
  return <form action={saveAnnouncement} className="editor-form">
    {announcement ? <input type="hidden" name="id" value={announcement.id}/> : null}
    <AnnouncementFields initialTitle={announcement?.title} initialDescription={announcement?.body}/>
    <label>Status<select name="lifecycle_status" defaultValue={announcement?.lifecycle_status === "archived" ? "draft" : announcement?.lifecycle_status || "published"}><option value="published">Published</option><option value="draft">Draft</option></select><small>Published announcements are immediately visible to everyone.</small></label>
    <PendingSubmitButton className="button dark" pendingLabel={announcement ? "Saving changes…" : "Posting announcement…"}>{announcement ? "Save changes" : "Post announcement"}</PendingSubmitButton>
  </form>;
}

function WorkshopForm({ workshop }: { workshop?: WorkshopRow }) {
  return <form action={saveWorkshop} className="editor-form">{workshop ? <input type="hidden" name="id" value={workshop.id}/> : null}<label className="wide">Workshop title<input name="title" defaultValue={workshop?.title} required/></label><label className="wide">Description<textarea name="descriptions" defaultValue={workshop?.descriptions} rows={4} required/></label><label>Date<input type="date" name="date" defaultValue={workshop?.date} required/></label><label>Status<select name="lifecycle_status" defaultValue={workshop?.lifecycle_status === "archived" ? "draft" : workshop?.lifecycle_status || "published"}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></label><label>Host<input name="host_name" defaultValue={workshop?.host_name} required/></label><label>Start time<input type="time" name="start_time" defaultValue={workshop?.start_time.slice(0,5)} required/></label><label>End time<input type="time" name="end_time" defaultValue={workshop?.end_time.slice(0,5)} required/></label><label>Venue<input name="venue" defaultValue={workshop?.venue} required/></label><label>Maximum places<input type="number" min="1" max="500" name="maximum_participants" defaultValue={workshop?.maximum_participants || 20} required/></label><label className="wide">Virtual link<input type="url" name="virtual_link" defaultValue={workshop?.virtual_link}/></label><label className="wide">Notes<textarea name="notes" defaultValue={workshop?.notes} rows={3}/></label><PendingSubmitButton className="button dark" pendingLabel={workshop ? "Saving changes…" : "Creating workshop…"}>{workshop ? "Save changes" : "Create workshop"}</PendingSubmitButton></form>;
}

function statusNotice(value?: string) {
  const messages: Record<string, string> = { "announcement-saved": "Announcement saved.", "announcement-restored": "Announcement restored as a draft.", "old-announcements-deleted": "Announcements archived more than one year ago were permanently deleted.", "event-saved": "Event saved.", "event-draft-saved": "Draft saved.", "event-published": "Event published.", "event-archived": "Event moved to the archive.", "event-restored": "Event restored as a draft.", "workshop-saved": "Workshop saved.", "reservation-cancelled": "Workshop reservation cancelled.", "reservation-email-sent": "Workshop email sent.", "invitation-sent": "Invitation sent.", "member-archived": "Member archived and portal access blocked.", "member-restored": "Member access restored.", "member-suspended": "Member access suspended.", "member-purged": "Archived member permanently deleted." };
  return value ? messages[value] : null;
}

export default async function AdminSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Query> }) {
  const [{ section }, query, session] = await Promise.all([params, searchParams, requireUser()]);
  if (!( ["announcements", "events", "workshops", "members"] as const).includes(section as never)) notFound();
  const needed = section === "announcements" ? "announcements.manage" : section === "events" ? "events.manage" : section === "workshops" ? "workshops.manage" : "members.view";
  if (!hasCapability(session.role, needed)) notFound();
  const admin = createAdminClient();
  const notice = statusNotice(query.notice);

  if (section === "announcements") {
    const status = query.status === "draft" || query.status === "archived" ? query.status : "published";
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const announcementStatuses = ["published", "draft", "archived"] as const;
    const archiveCutoff = new Date();
    archiveCutoff.setUTCFullYear(archiveCutoff.getUTCFullYear() - 1);
    const [announcementResult, announcementCountResults, oldArchiveCountResult] = await Promise.all([
      admin.from("announcements")
        .select("id,title,body,lifecycle_status,published_at,updated_at", { count: "exact" })
        .eq("lifecycle_status", status)
        .order("updated_at", { ascending: false })
        .range((currentPage - 1) * ANNOUNCEMENT_PAGE_SIZE, currentPage * ANNOUNCEMENT_PAGE_SIZE - 1),
      Promise.all(announcementStatuses.map((value) => admin.from("announcements").select("id", { count: "exact", head: true }).eq("lifecycle_status", value))),
      session.role === "administrator"
        ? admin.from("announcements").select("id", { count: "exact", head: true }).eq("lifecycle_status", "archived").not("archived_at", "is", null).lt("archived_at", archiveCutoff.toISOString())
        : Promise.resolve({ count: 0, error: null }),
    ]);
    if (announcementResult.error || announcementCountResults.some((result) => result.error) || oldArchiveCountResult.error) throw new Error("Unable to load announcements.");
    const visibleAnnouncements = (announcementResult.data ?? []) as AnnouncementRow[];
    const statusCounts = Object.fromEntries(announcementStatuses.map((value, index) => [value, announcementCountResults[index].count ?? 0])) as Record<(typeof announcementStatuses)[number], number>;
    const pageCount = Math.max(1, Math.ceil((announcementResult.count ?? 0) / ANNOUNCEMENT_PAGE_SIZE));
    if (currentPage > pageCount) redirect(`/admin/announcements?status=${status}&page=${pageCount}`);
    const announcementTotal = Object.values(statusCounts).reduce((total, value) => total + value, 0);
    const pageHref = (page: number) => `/admin/announcements?status=${status}&page=${page}`;

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Public noticeboard</p><h1>Announcements</h1><p>Post updates for everyone visiting the public website. Only committee members and administrators can manage these messages.</p></div></header>
      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {notice ? <p className="form-message success">{notice}</p> : null}
      <details className="manager-panel" open={!announcementTotal}><summary><Plus/>Post an announcement</summary><AnnouncementForm/></details>
      <nav className="status-filter" aria-label="Filter announcements by status">
        <Link prefetch={false} href="/admin/announcements?status=published" aria-current={status === "published" ? "page" : undefined}>Published <span>{statusCounts.published}</span></Link>
        <Link prefetch={false} href="/admin/announcements?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{statusCounts.draft}</span></Link>
        <Link prefetch={false} href="/admin/announcements?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archived <span>{statusCounts.archived}</span></Link>
      </nav>
      {status === "archived" && session.role === "administrator" ? <aside className="archive-cleanup" aria-label="Archived announcement cleanup"><div><strong>Archive retention</strong><p>{oldArchiveCountResult.count ? `${oldArchiveCountResult.count} announcement${oldArchiveCountResult.count === 1 ? " is" : "s are"} older than one year and can be permanently deleted.` : "There are no archived announcements older than one year."}</p></div><form action={deleteOldArchivedAnnouncements}><PendingSubmitButton className="danger-button" pendingLabel="Deleting…" disabled={!oldArchiveCountResult.count} confirmMessage={`Permanently delete ${oldArchiveCountResult.count ?? 0} archived announcement${oldArchiveCountResult.count === 1 ? "" : "s"} older than one year? This cannot be undone.`}><Trash2/>Delete old archives</PendingSubmitButton></form></aside> : null}
      <div className="admin-list">{visibleAnnouncements.map(announcement => <article key={announcement.id}><div className="admin-list-icon"><Megaphone/></div><div><span>{announcement.lifecycle_status}{announcement.published_at ? ` · ${format(new Date(announcement.published_at), "d MMMM yyyy")}` : ""}</span><h2>{announcement.title}</h2><p>{announcement.body}</p></div><div className="admin-list-actions">{announcement.lifecycle_status === "archived" ? <form action={restoreAnnouncement}><input type="hidden" name="id" value={announcement.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : <><details><summary><Pencil/>Edit</summary><div className="popover-editor"><AnnouncementForm announcement={announcement}/></div></details><form action={archiveAnnouncement}><input type="hidden" name="id" value={announcement.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></>}</div></article>)}</div>
      {!visibleAnnouncements.length ? <div className="empty-state"><Megaphone/><h2>No {status} announcements</h2><p>{status === "archived" ? "Archived announcements will appear here." : `Create or move an announcement into ${status} status to see it here.`}</p></div> : null}
      <PortalPagination currentPage={currentPage} totalPages={pageCount} totalItems={announcementResult.count ?? 0} itemLabel="announcements" href={pageHref} ariaLabel="Announcement pages"/>
    </div>;
  }

  if (section === "events") {
    const status: LifecycleStatus = (["published", "draft", "cancelled", "archived"] as const).includes(query.status as never) ? query.status as LifecycleStatus : "published";
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const eventStatuses = ["published", "draft", "cancelled", "archived"] as const;
    let eventQuery = admin.from("events")
      .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,public_teaser_enabled,booking_enabled,booking_mode,booking_capacity,lifecycle_status,updated_at", { count: "exact" })
      .eq("lifecycle_status", status);
    if (status === "published") {
      eventQuery = eventQuery.order("start_date").order("start_time").order("id");
    } else if (status === "draft" || status === "cancelled") {
      eventQuery = eventQuery.order("updated_at", { ascending: false }).order("start_date", { ascending: false }).order("start_time", { ascending: false }).order("id", { ascending: false });
    } else {
      eventQuery = eventQuery.order("end_date", { ascending: false }).order("start_date", { ascending: false }).order("start_time", { ascending: false }).order("id", { ascending: false });
    }
    const [eventResult, ...eventCountResults] = await Promise.all([
      eventQuery.range((currentPage - 1) * EVENT_PAGE_SIZE, currentPage * EVENT_PAGE_SIZE - 1),
      ...eventStatuses.map((value) => admin.from("events").select("id", { count: "exact", head: true }).eq("lifecycle_status", value)),
    ]);
    if (eventResult.error || eventCountResults.some((result) => result.error)) throw new Error("Unable to load events.");
    const visibleEvents = (eventResult.data ?? []) as EventRow[];
    const statusCounts = Object.fromEntries(eventStatuses.map((value, index) => [value, eventCountResults[index].count ?? 0])) as Record<LifecycleStatus, number>;
    const pageCount = Math.max(1, Math.ceil((eventResult.count ?? 0) / EVENT_PAGE_SIZE));
    if (currentPage > pageCount) redirect(`/admin/events?status=${status}&page=${pageCount}`);
    const pageHref = (page: number) => `/admin/events?status=${status}&page=${page}`;
    const emptyCopy: Record<string, string> = {
      published: "Publish an event to add it to the upcoming timetable.",
      draft: "Events saved as drafts will appear here.",
      cancelled: "Cancelled events will appear here.",
      archived: "Past events are moved here automatically after their end date.",
    };

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Content control</p><h1>Manage events</h1><p>Create and maintain public or member-only dates. Past events move into the archive automatically.</p></div><EventEditorDialog intent="create" triggerClassName="button dark event-create-trigger"/></header>
      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {notice ? <p className="form-message success">{notice}</p> : null}
      <nav className="status-filter event-status-filter" aria-label="Filter events by status">
        <Link prefetch={false} href="/admin/events?status=published" aria-current={status === "published" ? "page" : undefined}>Upcoming <span>{statusCounts.published}</span></Link>
        <Link prefetch={false} href="/admin/events?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{statusCounts.draft}</span></Link>
        <Link prefetch={false} href="/admin/events?status=cancelled" aria-current={status === "cancelled" ? "page" : undefined}>Cancelled <span>{statusCounts.cancelled}</span></Link>
        <Link prefetch={false} href="/admin/events?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archive <span>{statusCounts.archived}</span></Link>
      </nav>
      <div className="admin-list event-admin-list">{visibleEvents.map(event => {
        const isPast = event.end_date < new Date().toISOString().slice(0, 10);
        const editorIntent = event.lifecycle_status === "archived" && isPast ? "reschedule" : "edit";
        return <article key={event.id}><div className="admin-list-icon"><CalendarDays/></div><div><span>{event.event_type.replace("_", " ")} · {isPast ? "past · " : ""}{event.lifecycle_status} · {event.booking_mode === "website" ? "website booking" : "no booking needed"}</span><h2>{event.name}</h2><p><time dateTime={event.start_date}>{format(parseISO(event.start_date), "d MMMM yyyy")}</time>{event.end_date !== event.start_date ? <>–<time dateTime={event.end_date}>{format(parseISO(event.end_date), "d MMMM yyyy")}</time></> : null} · {event.start_time.slice(0,5)}–{event.end_time.slice(0,5)}</p></div><div className="admin-list-actions"><EventEditorDialog event={event} currentImage={event.file_url ? eventImage(event.file_url) : undefined} intent={editorIntent}/><EventEditorDialog event={event} currentImage={event.file_url ? eventImage(event.file_url) : undefined} intent="duplicate"/>{event.lifecycle_status === "archived" ? !isPast ? <form action={restoreEvent}><input type="hidden" name="id" value={event.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : null : <form action={deleteEvent}><input type="hidden" name="id" value={event.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form>}</div></article>;
      })}</div>
      {!visibleEvents.length ? <div className="empty-state"><CalendarDays/><h2>No {status === "published" ? "upcoming" : status} events</h2><p>{emptyCopy[status]}</p></div> : null}
      <PortalPagination currentPage={currentPage} totalPages={pageCount} totalItems={eventResult.count ?? 0} itemLabel="events" href={pageHref} ariaLabel="Event pages"/>
    </div>;
  }

  if (section === "workshops") {
    const status: LifecycleStatus = (["published", "draft", "cancelled", "archived"] as const).includes(query.status as never) ? query.status as LifecycleStatus : "published";
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const workshopStatuses = ["published", "draft", "cancelled", "archived"] as const;
    let workshopQuery = admin.from("workshops")
      .select("id,title,descriptions,notes,date,start_time,end_time,host_name,venue,virtual_link,maximum_participants,lifecycle_status,updated_at", { count: "exact" })
      .eq("lifecycle_status", status);
    if (status === "published") {
      workshopQuery = workshopQuery.order("date").order("start_time").order("id");
    } else if (status === "draft" || status === "cancelled") {
      workshopQuery = workshopQuery.order("updated_at", { ascending: false }).order("date", { ascending: false }).order("start_time", { ascending: false }).order("id", { ascending: false });
    } else {
      workshopQuery = workshopQuery.order("date", { ascending: false }).order("start_time", { ascending: false }).order("id", { ascending: false });
    }
    const [workshopResult, ...workshopCountResults] = await Promise.all([
      workshopQuery.range((currentPage - 1) * WORKSHOP_PAGE_SIZE, currentPage * WORKSHOP_PAGE_SIZE - 1),
      ...workshopStatuses.map((value) => admin.from("workshops").select("id", { count: "exact", head: true }).eq("lifecycle_status", value)),
    ]);
    if (workshopResult.error || workshopCountResults.some((result) => result.error)) throw new Error("Unable to load workshops.");
    const visibleWorkshops = (workshopResult.data ?? []) as WorkshopRow[];
    const statusCounts = Object.fromEntries(workshopStatuses.map((value, index) => [value, workshopCountResults[index].count ?? 0])) as Record<LifecycleStatus, number>;
    const pageCount = Math.max(1, Math.ceil((workshopResult.count ?? 0) / WORKSHOP_PAGE_SIZE));
    if (currentPage > pageCount) redirect(`/admin/workshops?status=${status}&page=${pageCount}`);
    const workshopTotal = Object.values(statusCounts).reduce((total, value) => total + value, 0);
    const visibleWorkshopIds = visibleWorkshops.map((workshop) => workshop.id);
    const reservationResult = visibleWorkshopIds.length
      ? await admin.from("participants")
        .select("id,reference_id,participant_id,created_at,reservation_status,notification_email_attempts,notification_email_error")
        .in("reference_id", visibleWorkshopIds)
        .order("created_at")
      : { data: [], error: null };
    if (reservationResult.error) throw new Error("Unable to load workshop reservations.");
    const reservations = reservationResult.data ?? [];
    const participantIds = [...new Set(reservations.flatMap(item => item.participant_id ? [item.participant_id] : []))];
    const memberResult = participantIds.length ? await admin.from("users").select("id,full_name,email,contact_number").in("id", participantIds) : { data: [], error: null };
    if (memberResult.error) throw new Error("Unable to load workshop members.");
    const members = new Map((memberResult.data ?? []).map(member => [member.id, member]));
    const pageHref = (page: number) => `/admin/workshops?status=${status}&page=${page}`;
    const emptyCopy: Record<string, string> = {
      published: "Publish a workshop to add it to the upcoming programme.",
      draft: "Workshops saved as drafts will appear here.",
      cancelled: "Cancelled workshops will remain here for reference.",
      archived: "Archived workshops will appear here.",
    };

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Skills & sessions</p><h1>Workshops</h1><p>Schedule sessions, control capacity and manage member rosters.</p></div><span className="count-badge"><Wrench/>{statusCounts.published} upcoming</span></header>
      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {notice ? <p className="form-message success">{notice}</p> : null}
      <details className="manager-panel" open={!workshopTotal}><summary><Plus/>Create a workshop</summary><WorkshopForm/></details>
      <nav className="status-filter event-status-filter" aria-label="Filter workshops by status">
        <Link prefetch={false} href="/admin/workshops?status=published" aria-current={status === "published" ? "page" : undefined}>Upcoming <span>{statusCounts.published}</span></Link>
        <Link prefetch={false} href="/admin/workshops?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{statusCounts.draft}</span></Link>
        <Link prefetch={false} href="/admin/workshops?status=cancelled" aria-current={status === "cancelled" ? "page" : undefined}>Cancelled <span>{statusCounts.cancelled}</span></Link>
        <Link prefetch={false} href="/admin/workshops?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archive <span>{statusCounts.archived}</span></Link>
      </nav>
      <div className="admin-list workshop-admin-list">{visibleWorkshops.map(workshop => {
      const roster = reservations.filter(item => item.reference_id === workshop.id && item.reservation_status === "reserved");
      const deliveryIssues = reservations.filter(item => item.reference_id === workshop.id && item.notification_email_error);
      const placesRemaining = Math.max(0, workshop.maximum_participants - roster.length);
      return <article key={workshop.id} className={`is-${workshop.lifecycle_status}`}>
        <time className="workshop-admin-date" dateTime={workshop.date}><strong>{format(parseISO(workshop.date), "dd")}</strong><span>{format(parseISO(workshop.date), "MMM")}</span><small>{format(parseISO(workshop.date), "yyyy")}</small></time>
        <div className="workshop-admin-content">
          <div className="workshop-admin-kicker"><span>{workshop.lifecycle_status}</span><span>Hosted by {workshop.host_name}</span></div>
          <h2>{workshop.title}</h2>
          <p className="workshop-admin-description">{workshop.descriptions}</p>
          <dl className="workshop-admin-facts"><div><dt>Time</dt><dd>{workshop.start_time.slice(0,5)}–{workshop.end_time.slice(0,5)}</dd></div><div><dt>Venue</dt><dd>{workshop.venue}</dd></div>{workshop.virtual_link ? <div><dt>Format</dt><dd>In person + online</dd></div> : null}</dl>
          <div className="workshop-capacity"><div><span><UsersRound/>{roster.length}/{workshop.maximum_participants} places reserved</span><strong>{placesRemaining ? `${placesRemaining} remaining` : "Workshop full"}</strong></div><progress aria-label={`${roster.length} of ${workshop.maximum_participants} workshop places reserved`} max={workshop.maximum_participants} value={roster.length}/></div>
          <div className="workshop-roster-tools"><details><summary><UsersRound/>Roster ({roster.length})</summary><div className="roster-list">{roster.map(reservation => { const member = reservation.participant_id ? members.get(reservation.participant_id) : undefined; return <div key={reservation.id}><span><strong>{member?.full_name || "Former member"}</strong><small>{member?.email} {member?.contact_number ? `· ${member.contact_number}` : ""}</small></span><form action={cancelWorkshopReservation}><input type="hidden" name="id" value={reservation.id}/><PendingSubmitButton pendingLabel="Cancelling…">Cancel place</PendingSubmitButton></form></div>; })}{!roster.length ? <p>No reservations.</p> : null}</div><Link prefetch={false} className="button secondary" href={`/admin/workshops/export?workshop=${workshop.id}`}><Download/>Export roster</Link></details>{deliveryIssues.length ? <details><summary><MailCheck/>Email delivery issues ({deliveryIssues.length})</summary><div className="roster-list">{deliveryIssues.map(reservation => { const member = reservation.participant_id ? members.get(reservation.participant_id) : undefined; return <div key={`email-${reservation.id}`}><span><strong>{member?.full_name || "Former member"}</strong><small>{reservation.reservation_status} · {reservation.notification_email_attempts} attempt{reservation.notification_email_attempts === 1 ? "" : "s"}</small></span>{reservation.participant_id ? <form action={retryWorkshopReservationEmail}><input type="hidden" name="id" value={reservation.id}/><PendingSubmitButton pendingLabel="Sending…">Retry email</PendingSubmitButton></form> : null}</div>; })}</div></details> : null}</div>
        </div>
        <div className="admin-list-actions">{workshop.lifecycle_status === "archived" ? <form action={restoreWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : <><details><summary><Pencil/>Edit</summary><div className="popover-editor"><WorkshopForm workshop={workshop}/></div></details><form action={deleteWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></>}</div>
      </article>;
      })}</div>
      {!visibleWorkshops.length ? <div className="empty-state"><Wrench/><h2>No {status === "published" ? "upcoming" : status} workshops</h2><p>{emptyCopy[status]}</p></div> : null}
      <PortalPagination currentPage={currentPage} totalPages={pageCount} totalItems={workshopResult.count ?? 0} itemLabel="workshops" href={pageHref} ariaLabel="Workshop pages"/>
    </div>;
  }

  const search = safeSearchTerm(query.q);
  const membershipEnabled = membershipAdministrationEnabled();
  const administrator = session.role === "administrator";
  const canManageMemberStatus = administrator || session.membershipOfficer;
  const memberStatuses = membershipEnabled
    ? ["active", "honorary", "lapsed", "suspended", "archived"]
    : ["active", "suspended", "archived"];
  const status = memberStatuses.includes(query.status || "") ? query.status! : "active";
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const canonical = createServiceClient();
  const { data: honoraryLinks, error: honoraryLinksError } = membershipEnabled
    ? await canonical.from("members").select("id,auth_user_id")
      .eq("effective_state", "honorary").not("auth_user_id", "is", null).limit(10000)
    : { data: [], error: null };
  if (honoraryLinksError) throw new Error("Unable to load honorary members.");
  const honoraryUserIds = (honoraryLinks ?? []).flatMap((member) => member.auth_user_id ? [member.auth_user_id] : []);
  let membersQuery = admin.from("users").select("id,title,full_name,email,contact_number,club_rules_agreement,membership_status,archived_at,retention_until,legal_hold,retention_purge_attempts,retention_purge_claimed_at,retention_purge_last_attempt_at", { count: "exact" });
  membersQuery = status === "honorary"
    ? membersQuery.in("id", honoraryUserIds.length ? honoraryUserIds : ["00000000-0000-0000-0000-000000000000"])
    : membersQuery.eq("membership_status", status);
  if (search) membersQuery = membersQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,contact_number.ilike.%${search}%`);
  const [membersResult, activeResult, lapsedResult, suspendedResult, archivedResult] = await Promise.all([
    membersQuery.order("full_name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    admin.from("users").select("id", { count: "exact", head: true }).eq("membership_status", "active"),
    admin.from("users").select("id", { count: "exact", head: true }).eq("membership_status", "lapsed"),
    admin.from("users").select("id", { count: "exact", head: true }).eq("membership_status", "suspended"),
    admin.from("users").select("id", { count: "exact", head: true }).eq("membership_status", "archived"),
  ]);
  const { data: users, count, error } = membersResult;
  if (error || activeResult.error || lapsedResult.error || suspendedResult.error || archivedResult.error) throw new Error("Unable to load members.");
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (page > pages) {
    const canonical = new URLSearchParams({ ...(search ? { q: search } : {}), status, page: String(pages) });
    redirect(`/admin/members?${canonical}`);
  }
  const ids = (users ?? []).map(member => member.id);
  const [rolesResult, committeeResult, membershipHoldResult, canonicalMemberResult] = ids.length
    ? await Promise.all([
      admin.from("user_roles").select("user_id,role").in("user_id", ids),
      admin.from("committees").select("user_id").in("user_id", ids),
      admin.from("membership_records").select("auth_user_id").in("auth_user_id", ids).eq("legal_hold", true),
      membershipEnabled
        ? canonical.from("members").select("id,auth_user_id,effective_state").in("auth_user_id", ids)
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  if (rolesResult.error || committeeResult.error || membershipHoldResult.error || canonicalMemberResult.error) throw new Error("Unable to load member retention dependencies.");
  const roles = rolesResult.data;
  const roleMap = new Map((roles ?? []).map(item => [item.user_id, item.role]));
  const committeeUserIds = new Set((committeeResult.data ?? []).flatMap(item => item.user_id ? [item.user_id] : []));
  const membershipHoldUserIds = new Set((membershipHoldResult.data ?? []).flatMap(item => item.auth_user_id ? [item.auth_user_id] : []));
  const canonicalMemberMap = new Map((canonicalMemberResult.data ?? []).flatMap(item => item.auth_user_id ? [[item.auth_user_id, item]] : []));
  const pageHref = (value: number) => `/admin/members?${new URLSearchParams({ ...(search ? { q: search } : {}), status, page: String(value) })}`;
  const memberTabHref = (value: string) => `/admin/members?${new URLSearchParams({ ...(search ? { q: search } : {}), status: value })}`;
  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Committee register</p><h1>Members</h1><p>Review member contact details and website access. Membership officers can suspend or archive ordinary member accounts; administrators control invitations, roles and restoration.</p></div><span className="count-badge"><UsersRound/>{count ?? 0} {status}</span></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{notice ? <p className="form-message success">{notice}</p> : null}
    {administrator ? <details className="manager-panel"><summary><UserPlus/>Invite a member</summary><form action={inviteMember} className="editor-form"><label>Full name<input name="full_name" required/></label><label>Email address<input type="email" name="email" required/></label><PendingSubmitButton className="button dark" pendingLabel="Sending invitation…">Send secure invitation</PendingSubmitButton></form></details> : null}
    <PortalTabs label="Member status" tabs={[
      { href: memberTabHref("active"), label: "Active", count: activeResult.count ?? 0, current: status === "active" },
      ...(membershipEnabled ? [
        { href: memberTabHref("honorary"), label: "Honorary", count: honoraryUserIds.length, current: status === "honorary" },
        { href: memberTabHref("lapsed"), label: "Lapsed", count: lapsedResult.count ?? 0, current: status === "lapsed" },
      ] : []),
      { href: memberTabHref("suspended"), label: "Suspended", count: suspendedResult.count ?? 0, current: status === "suspended" },
      { href: memberTabHref("archived"), label: "Archived", count: archivedResult.count ?? 0, current: status === "archived" },
    ]}/>
    <form className="portal-filter-panel" method="get"><input type="hidden" name="status" value={status}/><div className="portal-filter-heading"><div><h2>Find a member</h2><p>Search the selected status by name, email address or telephone number.</p></div>{administrator || (membershipEnabled && session.membershipOfficer) ? <div className="bulk-links">{membershipEnabled && session.membershipOfficer ? <Link prefetch={false} href="/admin/memberships">Membership register</Link> : administrator ? <Link prefetch={false} href="/administrator/member-import">MemberMojo final import</Link> : null}{administrator ? <Link prefetch={false} href="/administrator/add-members">Bulk invite</Link> : null}</div> : null}</div><div className="portal-filter-grid"><label className="portal-filter-search">Member details<span><Search/><input name="q" defaultValue={search} placeholder="Name, email or phone" autoComplete="off"/></span></label><button className="button dark" type="submit">Search members</button>{search ? <Link prefetch={false} className="portal-filter-clear" href={`/admin/members?status=${status}`}><RotateCcw/>Clear search</Link> : null}</div></form>
    <div className="member-table">
      <div className="member-row table-head"><span>Member</span><span>Contact</span><span>Role</span><span>Actions</span></div>
      {(users ?? []).map(member => {
        const memberRole = roleMap.get(member.id) || "member";
        const canChangeThisStatus = canManageMemberStatus && (administrator || memberRole === "member");
        const canonicalMember = canonicalMemberMap.get(member.id);
        return <div className={`member-row is-${member.membership_status}`} key={member.id}>
          <div className="member-identity">
            <div className="member-identity-heading"><strong>{member.full_name || "Name not set"}</strong><span className={`member-status is-${member.membership_status}`}>{status === "honorary" ? "honorary" : member.membership_status}{member.legal_hold || membershipHoldUserIds.has(member.id) ? " · legal hold (deletion blocked)" : ""}</span></div>
            <small>{member.title || "Member"}</small>
            {canonicalMember && session.membershipOfficer ? <Link href={`/admin/memberships?member=${canonicalMember.id}`}>Membership and payment history</Link> : null}
            {member.retention_purge_claimed_at ? <small>Automatic deletion in progress</small> : member.retention_until ? <small>{member.membership_status === "archived" ? (new Date(member.retention_until) < new Date() ? "Automatic deletion is due" : "Automatic deletion after") : "Details kept until"} {new Date(member.retention_until).toLocaleDateString("en-GB")}</small> : null}
            {member.retention_purge_attempts > 0 && member.retention_purge_last_attempt_at ? <small>Automatic deletion attempts: {member.retention_purge_attempts} · last {new Date(member.retention_purge_last_attempt_at).toLocaleDateString("en-GB")}</small> : null}
            {member.membership_status === "archived" && (memberRole !== "member" || committeeUserIds.has(member.id)) ? <small>Restore the account, remove its privileged role and current committee listing, then archive it again.</small> : null}
          </div>
          <div className="member-contact"><span className="member-cell-label">Contact details</span><a href={`mailto:${member.email}`}>{member.email}</a><small>{member.contact_number || "No telephone number"}</small></div>
          {administrator ? <form className="member-role-form" action={updateMemberRole}>
            <input type="hidden" name="user_id" value={member.id}/>
            <label><span className="member-cell-label">Website access level</span><select aria-label={`Role for ${member.full_name || member.email}`} name="role" defaultValue={memberRole} disabled={member.membership_status !== "active"}><option value="member">Member</option><option value="committee">Committee</option><option value="administrator">Administrator</option></select></label>
            <PendingSubmitButton className="member-save-role" disabled={member.membership_status !== "active"}>Save role</PendingSubmitButton>
          </form> : <div className="member-role-form member-role-readonly"><span className="member-cell-label">Website access level</span><strong>{memberRole === "administrator" ? "Administrator" : memberRole === "committee" ? "Committee" : "Member"}</strong></div>}
          <div className="member-actions">
            <span className="member-cell-label">Sign-in access</span>
            {member.membership_status === "active" ? canChangeThisStatus ? <div className="member-action-group"><form action={suspendMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton className="member-action-button suspend-button" pendingLabel="Suspending…"><UserX/>Suspend access</PendingSubmitButton></form><form action={deleteMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton className="member-action-button archive-button" pendingLabel="Archiving…"><Archive/>Archive member</PendingSubmitButton></form></div> : <p>Read-only access.</p> : member.membership_status === "lapsed" ? <p>Renewal is required before website access is restored.</p> : member.retention_purge_claimed_at ? <p>Automatic deletion is in progress; restoration is temporarily unavailable.</p> : administrator ? <form action={restoreMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton className="member-action-button restore-button" pendingLabel="Restoring…"><RotateCcw/>Restore member</PendingSubmitButton></form> : <p>Only an administrator can restore access.</p>}
            {administrator && member.membership_status === "archived" ? <details><summary>Permanent deletion</summary>{member.legal_hold || membershipHoldUserIds.has(member.id) ? <p>This record is under a legal hold and cannot be deleted.</p> : (memberRole !== "member" || committeeUserIds.has(member.id)) ? <p>Restore the account, remove its privileged role and current committee listing, then archive it again.</p> : member.retention_purge_claimed_at ? <p>Automatic deletion is already in progress.</p> : <form action={purgeMember} className="stack-form"><input type="hidden" name="user_id" value={member.id}/><label>Current administrator password<input type="password" name="password" autoComplete="current-password" required/></label><label>Type DELETE {member.email}<input name="confirmation" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Deleting…">Permanently delete</PendingSubmitButton></form>}</details> : null}
          </div>
        </div>;
      })}
    </div>
    {!users?.length ? <div className="empty-state"><h2>No matching members</h2></div> : null}
    <PortalPagination currentPage={page} totalPages={pages} totalItems={count ?? 0} itemLabel="members" href={pageHref} ariaLabel="Member pages"/>
  </div>;
}
