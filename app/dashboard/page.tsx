import Link from "next/link";
import { CalendarDays, FileText, Megaphone, Plus, UsersRound, Wrench } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireUser, canManageContent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createMessage, deleteMessage, joinWorkshop, leaveWorkshop } from "@/lib/actions/content";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ user, role }, query] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [eventsResult, workshopsResult, feedsResult, docsResult, participantsResult] = await Promise.all([
    supabase.from("events").select("id,name,start_date,start_time,event_type").gte("end_date", today).order("start_date").limit(6),
    supabase.from("workshops").select("id,title,date,start_time,venue,maximum_participants").gte("date", today).order("date").limit(4),
    supabase.from("feeds").select("id,type,title,message,url,author_name,author_id,created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase.from("participants").select("reference_id,participant_id"),
  ]);
  const events = eventsResult.data ?? [];
  const workshops = workshopsResult.data ?? [];
  const feeds = feedsResult.data ?? [];
  const participants = participantsResult.data ?? [];

  return <div className="portal-content"><header className="portal-heading"><div><p className="eyebrow dark">Members’ signal box</p><h1>Good to see you.</h1><p>The live Society board—private dates, documents, workshops and notices.</p></div><Link href="/events" className="button outline">Public website</Link></header>{query.error ? <p className="form-message error">{query.error}</p> : null}{query.notice ? <p className="form-message success">Update complete.</p> : null}<section className="stat-grid"><article><CalendarDays/><strong>{events.length}</strong><span>upcoming dates</span></article><article><Wrench/><strong>{workshops.length}</strong><span>open workshops</span></article><article><FileText/><strong>{docsResult.count ?? 0}</strong><span>club documents</span></article><article><UsersRound/><strong>{role.replaceAll("-", " ")}</strong><span>your access level</span></article></section><div className="portal-grid"><section className="portal-card span-2"><div className="card-heading"><div><p className="eyebrow dark">Private timetable</p><h2>Upcoming running days</h2></div>{canManageContent(role) ? <Link href="/admin/events">Manage <Plus/></Link> : null}</div><div className="compact-list">{events.map(event=><article key={event.id}><time><strong>{format(parseISO(event.start_date), "dd")}</strong>{format(parseISO(event.start_date), "MMM")}</time><div><h3>{event.name}</h3><p>{event.event_type === "member_only" ? "Members only" : "Public event"} · {event.start_time.slice(0,5)}</p></div></article>)}{!events.length ? <p>No upcoming dates are listed.</p> : null}</div></section><section className="portal-card"><div className="card-heading"><div><p className="eyebrow dark">Workshop bench</p><h2>Learn & make</h2></div></div><div className="workshop-list">{workshops.map(workshop=>{const signedUp=participants.some(p=>p.reference_id===workshop.id&&p.participant_id===user.id);const places=participants.filter(p=>p.reference_id===workshop.id).length;return <article key={workshop.id}><h3>{workshop.title}</h3><p>{format(parseISO(workshop.date), "d MMM")} · {workshop.start_time.slice(0,5)}<br/>{workshop.venue}</p><span>{places}/{workshop.maximum_participants} places</span><form action={signedUp ? leaveWorkshop : joinWorkshop}><input type="hidden" name="id" value={workshop.id}/><button type="submit">{signedUp ? "Leave workshop" : "Reserve place"}</button></form></article>})}{!workshops.length ? <p>No workshops are currently scheduled.</p> : null}</div></section><section className="portal-card span-2"><div className="card-heading"><div><p className="eyebrow dark">Notice board</p><h2>Latest from the club</h2></div><Megaphone/></div><div className="feed-list">{feeds.map(feed=><article key={feed.id}><div><span>{feed.type}</span><time>{format(new Date(feed.created_at), "d MMM yyyy")}</time></div><h3>{feed.title || "Club update"}</h3><p>{feed.message}</p>{feed.url ? <a href={feed.url}>Open attachment →</a> : null}{(feed.author_id===user.id||canManageContent(role)) ? <form action={deleteMessage}><input type="hidden" name="id" value={feed.id}/><button type="submit">Remove</button></form> : null}</article>)}</div></section><section className="portal-card"><p className="eyebrow dark">Post to members</p><h2>Add a notice</h2><form action={createMessage} className="stack-form"><label>Title<input name="title" maxLength={120} required/></label><label>Message<textarea name="message" rows={5} maxLength={2000} required/></label><button type="submit" className="button dark">Post notice</button></form></section></div></div>;
}
