import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Archive, CalendarDays, Download, MailCheck, Megaphone, Pencil, Plus, RotateCcw, Search, UserPlus, UsersRound, UserX, Wrench } from "lucide-react";
import { hasCapability, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelWorkshopReservation,
  archiveAnnouncement,
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
  saveEvent,
  saveAnnouncement,
  saveWorkshop,
  suspendMember,
  updateMemberRole,
} from "@/lib/actions/content";
import { SignedUploadField } from "@/app/components/SignedUploadField";
import { safeSearchTerm } from "@/lib/security-input";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { AnnouncementFields } from "@/app/components/AnnouncementFields";
import { EventBookingFields } from "@/app/components/EventBookingFields";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const ANNOUNCEMENT_PAGE_SIZE = 12;
const EVENT_PAGE_SIZE = 12;
const WORKSHOP_PAGE_SIZE = 5;

type LifecycleStatus = "published" | "draft" | "cancelled" | "archived";
type EventRow = { id:number; name:string; descriptions:string; file_url:string; start_date:string; end_date:string; start_time:string; end_time:string; event_type:"public"|"member_only"; display_in_homepage:boolean; booking_enabled:boolean; booking_mode:string; booking_capacity:number|null; lifecycle_status:LifecycleStatus; updated_at:string };
type AnnouncementRow = { id:number; title:string; body:string; lifecycle_status:string; published_at:string|null; updated_at:string };
type WorkshopRow = { id:string; title:string; descriptions:string; notes:string; date:string; start_time:string; end_time:string; host_name:string; venue:string; virtual_link:string; maximum_participants:number; lifecycle_status:LifecycleStatus; updated_at:string };
type Query = { error?: string; notice?: string; q?: string; status?: string; page?: string };

function compareEvents(a: EventRow, b: EventRow, status: LifecycleStatus) {
  if (status === "published") {
    return a.start_date.localeCompare(b.start_date)
      || a.start_time.localeCompare(b.start_time)
      || a.id - b.id;
  }
  if (status === "draft" || status === "cancelled") {
    return b.updated_at.localeCompare(a.updated_at)
      || b.start_date.localeCompare(a.start_date)
      || b.start_time.localeCompare(a.start_time)
      || b.id - a.id;
  }
  return b.end_date.localeCompare(a.end_date)
    || b.start_date.localeCompare(a.start_date)
    || b.start_time.localeCompare(a.start_time)
    || b.id - a.id;
}

function compareWorkshops(a: WorkshopRow, b: WorkshopRow, status: LifecycleStatus) {
  if (status === "published") {
    return a.date.localeCompare(b.date)
      || a.start_time.localeCompare(b.start_time)
      || a.id.localeCompare(b.id);
  }
  if (status === "draft" || status === "cancelled") {
    return b.updated_at.localeCompare(a.updated_at)
      || b.date.localeCompare(a.date)
      || b.start_time.localeCompare(a.start_time)
      || b.id.localeCompare(a.id);
  }
  return b.date.localeCompare(a.date)
    || b.start_time.localeCompare(a.start_time)
    || b.id.localeCompare(a.id);
}

function EventForm({ event }: { event?: EventRow }) {
  const mode = event?.booking_mode === "website" || event?.booking_enabled ? "website" : "none";
  return <form action={saveEvent} className="editor-form">
    {event ? <input type="hidden" name="id" value={event.id}/> : null}
    <label className="wide">Event name<input name="name" defaultValue={event?.name} required/></label>
    <label className="wide">Description<textarea name="descriptions" defaultValue={event?.descriptions} rows={4} required/></label>
    <label>Start date<input type="date" name="start_date" defaultValue={event?.start_date} required/></label><label>End date<input type="date" name="end_date" defaultValue={event?.end_date} required/></label>
    <label>Start time<input type="time" name="start_time" defaultValue={event?.start_time.slice(0,5)} required/></label><label>End time<input type="time" name="end_time" defaultValue={event?.end_time.slice(0,5)} required/></label>
    <label>Audience<select name="event_type" defaultValue={event?.event_type || "member_only"}><option value="member_only">Members only</option><option value="public">Public</option></select></label>
    <label>Status<select name="lifecycle_status" defaultValue={event?.lifecycle_status === "archived" ? "draft" : event?.lifecycle_status || "published"}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></label>
    <EventBookingFields initialMode={mode} initialCapacity={event?.booking_capacity ?? 100}/>
    <SignedUploadField kind="event-image" label={event ? "Replace event image (optional)" : "Event image (optional)"}/><input type="hidden" name="file_url" value={event?.file_url || ""}/>
    <label className="check"><input type="checkbox" name="display_in_homepage" defaultChecked={event?.display_in_homepage}/>Feature on homepage</label>
    <PendingSubmitButton className="button dark" pendingLabel={event ? "Saving changes…" : "Creating event…"}>{event ? "Save changes" : "Create event"}</PendingSubmitButton>
  </form>;
}

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
  const messages: Record<string, string> = { "announcement-saved": "Announcement saved.", "announcement-restored": "Announcement restored as a draft.", "event-saved": "Event saved.", "event-archived": "Event moved to the archive.", "event-restored": "Event restored as a draft.", "workshop-saved": "Workshop saved.", "reservation-cancelled": "Workshop reservation cancelled.", "reservation-email-sent": "Workshop email sent.", "invitation-sent": "Invitation sent.", "member-archived": "Member archived and portal access blocked.", "member-restored": "Member access restored.", "member-suspended": "Member access suspended.", "member-purged": "Archived member permanently deleted." };
  return value ? messages[value] : null;
}

export default async function AdminSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Query> }) {
  const [{ section }, query, session] = await Promise.all([params, searchParams, requireUser()]);
  if (!( ["announcements", "events", "workshops", "members"] as const).includes(section as never)) notFound();
  const needed = section === "announcements" ? "announcements.manage" : section === "events" ? "events.manage" : section === "workshops" ? "workshops.manage" : "members.manage";
  if (!hasCapability(session.role, needed)) notFound();
  const admin = createAdminClient();
  const notice = statusNotice(query.notice);

  if (section === "announcements") {
    const { data, error } = await admin.from("announcements").select("id,title,body,lifecycle_status,published_at,updated_at").order("updated_at", { ascending: false });
    if (error) throw new Error("Unable to load announcements.");
    const announcements = (data ?? []) as AnnouncementRow[];
    const status = query.status === "draft" || query.status === "archived" ? query.status : "published";
    const publishedCount = announcements.filter(item => item.lifecycle_status === "published").length;
    const draftCount = announcements.filter(item => item.lifecycle_status === "draft").length;
    const archivedCount = announcements.filter(item => item.lifecycle_status === "archived").length;
    const filteredAnnouncements = announcements.filter(item => item.lifecycle_status === status);
    const pageCount = Math.max(1, Math.ceil(filteredAnnouncements.length / ANNOUNCEMENT_PAGE_SIZE));
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
    const visibleAnnouncements = filteredAnnouncements.slice((currentPage - 1) * ANNOUNCEMENT_PAGE_SIZE, currentPage * ANNOUNCEMENT_PAGE_SIZE);
    const pageHref = (page: number) => `/admin/announcements?status=${status}&page=${page}`;

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Public noticeboard</p><h1>Announcements</h1><p>Post updates for everyone visiting the public website. Only committee members and administrators can manage these messages.</p></div></header>
      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {notice ? <p className="form-message success">{notice}</p> : null}
      <details className="manager-panel" open={!announcements.length}><summary><Plus/>Post an announcement</summary><AnnouncementForm/></details>
      <nav className="status-filter" aria-label="Filter announcements by status">
        <Link href="/admin/announcements?status=published" aria-current={status === "published" ? "page" : undefined}>Published <span>{publishedCount}</span></Link>
        <Link href="/admin/announcements?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{draftCount}</span></Link>
        <Link href="/admin/announcements?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archived <span>{archivedCount}</span></Link>
      </nav>
      <div className="admin-list">{visibleAnnouncements.map(announcement => <article key={announcement.id}><div className="admin-list-icon"><Megaphone/></div><div><span>{announcement.lifecycle_status}{announcement.published_at ? ` · ${format(new Date(announcement.published_at), "d MMMM yyyy")}` : ""}</span><h2>{announcement.title}</h2><p>{announcement.body}</p></div><div className="admin-list-actions">{announcement.lifecycle_status === "archived" ? <form action={restoreAnnouncement}><input type="hidden" name="id" value={announcement.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : <><details><summary><Pencil/>Edit</summary><div className="popover-editor"><AnnouncementForm announcement={announcement}/></div></details><form action={archiveAnnouncement}><input type="hidden" name="id" value={announcement.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></>}</div></article>)}</div>
      {!visibleAnnouncements.length ? <div className="empty-state"><Megaphone/><h2>No {status} announcements</h2><p>{status === "archived" ? "Archived announcements will appear here." : `Create or move an announcement into ${status} status to see it here.`}</p></div> : null}
      {pageCount > 1 ? <nav className="pagination" aria-label="Announcement pages">{currentPage > 1 ? <Link href={pageHref(currentPage - 1)}>← Previous</Link> : <span/>}<span>Page {currentPage} of {pageCount}</span>{currentPage < pageCount ? <Link href={pageHref(currentPage + 1)}>Next →</Link> : <span/>}</nav> : null}
    </div>;
  }

  if (section === "events") {
    const { data, error } = await admin.from("events").select("*").order("start_date", { ascending: false });
    if (error) throw new Error("Unable to load events.");
    const events = (data ?? []) as EventRow[];
    const status: LifecycleStatus = (["published", "draft", "cancelled", "archived"] as const).includes(query.status as never) ? query.status as LifecycleStatus : "published";
    const statusCounts = {
      published: events.filter(event => event.lifecycle_status === "published").length,
      draft: events.filter(event => event.lifecycle_status === "draft").length,
      cancelled: events.filter(event => event.lifecycle_status === "cancelled").length,
      archived: events.filter(event => event.lifecycle_status === "archived").length,
    };
    const filteredEvents = events
      .filter(event => event.lifecycle_status === status)
      .sort((a, b) => compareEvents(a, b, status));
    const pageCount = Math.max(1, Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE));
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
    const visibleEvents = filteredEvents.slice((currentPage - 1) * EVENT_PAGE_SIZE, currentPage * EVENT_PAGE_SIZE);
    const pageHref = (page: number) => `/admin/events?status=${status}&page=${page}`;
    const emptyCopy: Record<string, string> = {
      published: "Publish an event to add it to the upcoming timetable.",
      draft: "Events saved as drafts will appear here.",
      cancelled: "Cancelled events will appear here.",
      archived: "Past events are moved here automatically after their end date.",
    };

    return <div className="portal-content">
      <header className="portal-heading"><div><p className="eyebrow dark">Content control</p><h1>Manage events</h1><p>Create and maintain public or member-only dates. Past events move into the archive automatically.</p></div></header>
      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {notice ? <p className="form-message success">{notice}</p> : null}
      <details className="manager-panel" open={!events.length}><summary><Plus/>Create an event</summary><EventForm/></details>
      <nav className="status-filter event-status-filter" aria-label="Filter events by status">
        <Link href="/admin/events?status=published" aria-current={status === "published" ? "page" : undefined}>Upcoming <span>{statusCounts.published}</span></Link>
        <Link href="/admin/events?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{statusCounts.draft}</span></Link>
        <Link href="/admin/events?status=cancelled" aria-current={status === "cancelled" ? "page" : undefined}>Cancelled <span>{statusCounts.cancelled}</span></Link>
        <Link href="/admin/events?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archive <span>{statusCounts.archived}</span></Link>
      </nav>
      <div className="admin-list event-admin-list">{visibleEvents.map(event => {
        const isPast = event.end_date < new Date().toISOString().slice(0, 10);
        return <article key={event.id}><div className="admin-list-icon"><CalendarDays/></div><div><span>{event.event_type.replace("_", " ")} · {isPast ? "past · " : ""}{event.lifecycle_status} · {event.booking_mode === "website" ? "website booking" : "no booking needed"}</span><h2>{event.name}</h2><p><time dateTime={event.start_date}>{format(parseISO(event.start_date), "d MMMM yyyy")}</time>{event.end_date !== event.start_date ? <>–<time dateTime={event.end_date}>{format(parseISO(event.end_date), "d MMMM yyyy")}</time></> : null} · {event.start_time.slice(0,5)}–{event.end_time.slice(0,5)}</p></div><div className="admin-list-actions">{event.lifecycle_status === "archived" ? <><details><summary><Pencil/>{isPast ? "Reschedule" : "Edit"}</summary><div className="popover-editor"><EventForm event={event}/></div></details>{!isPast ? <form action={restoreEvent}><input type="hidden" name="id" value={event.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : null}</> : <><details><summary><Pencil/>Edit</summary><div className="popover-editor"><EventForm event={event}/></div></details><form action={deleteEvent}><input type="hidden" name="id" value={event.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></>}</div></article>;
      })}</div>
      {!visibleEvents.length ? <div className="empty-state"><CalendarDays/><h2>No {status === "published" ? "upcoming" : status} events</h2><p>{emptyCopy[status]}</p></div> : null}
      {pageCount > 1 ? <nav className="pagination" aria-label="Event pages">{currentPage > 1 ? <Link href={pageHref(currentPage - 1)}>← Previous</Link> : <span/>}<span>Page {currentPage} of {pageCount}</span>{currentPage < pageCount ? <Link href={pageHref(currentPage + 1)}>Next →</Link> : <span/>}</nav> : null}
    </div>;
  }

  if (section === "workshops") {
    const [{ data, error }, { data: reservations }] = await Promise.all([
      admin.from("workshops").select("*").order("date", { ascending: false }),
      admin.from("participants").select("id,reference_id,participant_id,created_at,reservation_status,notification_email_attempts,notification_email_error").order("created_at"),
    ]);
    if (error) throw new Error("Unable to load workshops.");
    const participantIds = [...new Set((reservations ?? []).map(item => item.participant_id))];
    const memberResult = participantIds.length ? await admin.from("users").select("id,full_name,email,contact_number").in("id", participantIds) : { data: [] };
    const members = new Map((memberResult.data ?? []).map(member => [member.id, member]));
    const workshops = (data ?? []) as WorkshopRow[];
    const status: LifecycleStatus = (["published", "draft", "cancelled", "archived"] as const).includes(query.status as never) ? query.status as LifecycleStatus : "published";
    const statusCounts = {
      published: workshops.filter(workshop => workshop.lifecycle_status === "published").length,
      draft: workshops.filter(workshop => workshop.lifecycle_status === "draft").length,
      cancelled: workshops.filter(workshop => workshop.lifecycle_status === "cancelled").length,
      archived: workshops.filter(workshop => workshop.lifecycle_status === "archived").length,
    };
    const filteredWorkshops = workshops
      .filter(workshop => workshop.lifecycle_status === status)
      .sort((a, b) => compareWorkshops(a, b, status));
    const pageCount = Math.max(1, Math.ceil(filteredWorkshops.length / WORKSHOP_PAGE_SIZE));
    const requestedPage = Number(query.page);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
    const visibleWorkshops = filteredWorkshops.slice((currentPage - 1) * WORKSHOP_PAGE_SIZE, currentPage * WORKSHOP_PAGE_SIZE);
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
      <details className="manager-panel" open={!workshops.length}><summary><Plus/>Create a workshop</summary><WorkshopForm/></details>
      <nav className="status-filter event-status-filter" aria-label="Filter workshops by status">
        <Link href="/admin/workshops?status=published" aria-current={status === "published" ? "page" : undefined}>Upcoming <span>{statusCounts.published}</span></Link>
        <Link href="/admin/workshops?status=draft" aria-current={status === "draft" ? "page" : undefined}>Drafts <span>{statusCounts.draft}</span></Link>
        <Link href="/admin/workshops?status=cancelled" aria-current={status === "cancelled" ? "page" : undefined}>Cancelled <span>{statusCounts.cancelled}</span></Link>
        <Link href="/admin/workshops?status=archived" aria-current={status === "archived" ? "page" : undefined}>Archive <span>{statusCounts.archived}</span></Link>
      </nav>
      <div className="admin-list workshop-admin-list">{visibleWorkshops.map(workshop => {
      const roster = (reservations ?? []).filter(item => item.reference_id === workshop.id && item.reservation_status === "reserved");
      const deliveryIssues = (reservations ?? []).filter(item => item.reference_id === workshop.id && item.notification_email_error);
      const placesRemaining = Math.max(0, workshop.maximum_participants - roster.length);
      return <article key={workshop.id} className={`is-${workshop.lifecycle_status}`}>
        <time className="workshop-admin-date" dateTime={workshop.date}><strong>{format(parseISO(workshop.date), "dd")}</strong><span>{format(parseISO(workshop.date), "MMM")}</span><small>{format(parseISO(workshop.date), "yyyy")}</small></time>
        <div className="workshop-admin-content">
          <div className="workshop-admin-kicker"><span>{workshop.lifecycle_status}</span><span>Hosted by {workshop.host_name}</span></div>
          <h2>{workshop.title}</h2>
          <p className="workshop-admin-description">{workshop.descriptions}</p>
          <dl className="workshop-admin-facts"><div><dt>Time</dt><dd>{workshop.start_time.slice(0,5)}–{workshop.end_time.slice(0,5)}</dd></div><div><dt>Venue</dt><dd>{workshop.venue}</dd></div>{workshop.virtual_link ? <div><dt>Format</dt><dd>In person + online</dd></div> : null}</dl>
          <div className="workshop-capacity"><div><span><UsersRound/>{roster.length}/{workshop.maximum_participants} places reserved</span><strong>{placesRemaining ? `${placesRemaining} remaining` : "Workshop full"}</strong></div><progress aria-label={`${roster.length} of ${workshop.maximum_participants} workshop places reserved`} max={workshop.maximum_participants} value={roster.length}/></div>
          <div className="workshop-roster-tools"><details><summary><UsersRound/>Roster ({roster.length})</summary><div className="roster-list">{roster.map(reservation => { const member = members.get(reservation.participant_id); return <div key={reservation.id}><span><strong>{member?.full_name || "Member"}</strong><small>{member?.email} {member?.contact_number ? `· ${member.contact_number}` : ""}</small></span><form action={cancelWorkshopReservation}><input type="hidden" name="id" value={reservation.id}/><PendingSubmitButton pendingLabel="Cancelling…">Cancel place</PendingSubmitButton></form></div>; })}{!roster.length ? <p>No reservations.</p> : null}</div><Link className="button secondary" href={`/admin/workshops/export?workshop=${workshop.id}`}><Download/>Export roster</Link></details>{deliveryIssues.length ? <details><summary><MailCheck/>Email delivery issues ({deliveryIssues.length})</summary><div className="roster-list">{deliveryIssues.map(reservation => { const member = members.get(reservation.participant_id); return <div key={`email-${reservation.id}`}><span><strong>{member?.full_name || "Member"}</strong><small>{reservation.reservation_status} · {reservation.notification_email_attempts} attempt{reservation.notification_email_attempts === 1 ? "" : "s"}</small></span><form action={retryWorkshopReservationEmail}><input type="hidden" name="id" value={reservation.id}/><PendingSubmitButton pendingLabel="Sending…">Retry email</PendingSubmitButton></form></div>; })}</div></details> : null}</div>
        </div>
        <div className="admin-list-actions">{workshop.lifecycle_status === "archived" ? <form action={restoreWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore as draft</PendingSubmitButton></form> : <><details><summary><Pencil/>Edit</summary><div className="popover-editor"><WorkshopForm workshop={workshop}/></div></details><form action={deleteWorkshop}><input type="hidden" name="id" value={workshop.id}/><PendingSubmitButton pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></>}</div>
      </article>;
      })}</div>
      {!visibleWorkshops.length ? <div className="empty-state"><Wrench/><h2>No {status === "published" ? "upcoming" : status} workshops</h2><p>{emptyCopy[status]}</p></div> : null}
      {pageCount > 1 ? <nav className="pagination" aria-label="Workshop pages">{currentPage > 1 ? <Link href={pageHref(currentPage - 1)}>← Previous</Link> : <span/>}<span>Page {currentPage} of {pageCount}</span>{currentPage < pageCount ? <Link href={pageHref(currentPage + 1)}>Next →</Link> : <span/>}</nav> : null}
    </div>;
  }

  const search = safeSearchTerm(query.q);
  const status = ["active", "suspended", "archived"].includes(query.status || "") ? query.status! : "active";
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  let membersQuery = admin.from("users").select("id,title,full_name,email,contact_number,club_rules_agreement,membership_status,archived_at,retention_until,legal_hold", { count: "exact" }).eq("membership_status", status);
  if (search) membersQuery = membersQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,contact_number.ilike.%${search}%`);
  const { data: users, count, error } = await membersQuery.order("full_name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load members.");
  const ids = (users ?? []).map(member => member.id);
  const { data: roles } = ids.length ? await admin.from("user_roles").select("user_id,role").in("user_id", ids) : { data: [] };
  const roleMap = new Map((roles ?? []).map(item => [item.user_id, item.role]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (value: number) => `/admin/members?${new URLSearchParams({ ...(search ? { q: search } : {}), status, page: String(value) })}`;
  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Administrator only</p><h1>Member register</h1><p>Invite members, maintain access status and assign the three application roles.</p></div><span className="count-badge"><UsersRound/>{count ?? 0} {status}</span></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{notice ? <p className="form-message success">{notice}</p> : null}
    <details className="manager-panel"><summary><UserPlus/>Invite a member</summary><form action={inviteMember} className="editor-form"><label>Full name<input name="full_name" required/></label><label>Email address<input type="email" name="email" required/></label><PendingSubmitButton className="button dark" pendingLabel="Sending invitation…">Send secure invitation</PendingSubmitButton></form></details>
    <form className="booking-search" method="get"><label>Search members<div><Search/><input name="q" defaultValue={search} placeholder="Name, email or phone"/></div></label><label>Status<select name="status" defaultValue={status}><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label><button className="button dark" type="submit">Filter</button></form>
    <div className="bulk-links"><Link href="/administrator/add-members">Bulk invite by CSV</Link><Link href="/administrator/delete-members">Bulk archive by CSV</Link></div>
    <div className="member-table"><div className="member-row table-head"><span>Member</span><span>Contact</span><span>Role</span><span>Actions</span></div>{(users ?? []).map(member => <div className="member-row" key={member.id}><div><strong>{member.full_name || "Name not set"}</strong><small>{member.title} · {member.membership_status}{member.legal_hold ? " · legal hold" : ""}{member.retention_until ? ` · retained until ${new Date(member.retention_until).toLocaleDateString("en-GB")}` : ""}</small></div><div><span>{member.email}</span><small>{member.contact_number}</small></div><form action={updateMemberRole}><input type="hidden" name="user_id" value={member.id}/><select name="role" defaultValue={roleMap.get(member.id) || "member"} disabled={member.membership_status !== "active"}><option value="member">Member</option><option value="committee">Committee</option><option value="administrator">Administrator</option></select><PendingSubmitButton disabled={member.membership_status !== "active"}>Save</PendingSubmitButton></form><div className="member-actions">{member.membership_status === "active" ? <><form action={suspendMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton pendingLabel="Suspending…"><UserX/>Suspend</PendingSubmitButton></form><form action={deleteMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton className="danger-button" pendingLabel="Archiving…"><Archive/>Archive</PendingSubmitButton></form></> : <form action={restoreMember}><input type="hidden" name="user_id" value={member.id}/><PendingSubmitButton pendingLabel="Restoring…"><RotateCcw/>Restore</PendingSubmitButton></form>}{member.membership_status === "archived" ? <details><summary>Permanent deletion</summary>{member.legal_hold ? <p>Legal hold prevents deletion.</p> : <form action={purgeMember} className="stack-form"><input type="hidden" name="user_id" value={member.id}/><label>Current administrator password<input type="password" name="password" autoComplete="current-password" required/></label><label>Type DELETE {member.email}<input name="confirmation" required/></label><PendingSubmitButton className="danger-button" pendingLabel="Deleting…">Permanently delete</PendingSubmitButton></form>}</details> : null}</div></div>)}</div>
    {!users?.length ? <div className="empty-state"><h2>No matching members</h2></div> : null}
    {pages > 1 ? <nav className="pagination">{page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span/>}<span>Page {page} of {pages}</span>{page < pages ? <Link href={pageHref(page + 1)}>Next</Link> : <span/>}</nav> : null}
  </div>;
}
