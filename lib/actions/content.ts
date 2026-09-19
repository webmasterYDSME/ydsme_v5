"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageContent, requireCapability, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { finalizeQuarantinedUpload } from "@/lib/uploads";
import { sendWorkshopReservationUpdate } from "@/lib/booking-email";
import { safeHttpUrl } from "@/lib/security-input";
import { getTrustedAppOrigin } from "@/lib/trusted-origin";
import { storageObjectPath } from "@/lib/storage-path";
import {
  ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "@/lib/announcements";
import {
  ANNOUNCEMENTS_CACHE_TAG,
  MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG,
  MEMBER_DASHBOARD_EVENTS_CACHE_TAG,
  MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG,
  PUBLIC_DONATIONS_CACHE_TAG,
  PUBLIC_EVENTS_CACHE_TAG,
  PUBLIC_SITE_CONFIG_CACHE_TAG,
} from "@/lib/cache-tags";

const text = (min = 1, max = 5000) => z.string().trim().min(min).max(max);
const idString = z.string().min(1).max(100);
const httpUrl = z.string().trim().max(2048).refine((value) => Boolean(safeHttpUrl(value)), "Use an HTTP or HTTPS URL.");
const optionalUrl = z.union([z.literal(""), httpUrl]);

const eventTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Enter a valid time.")
  .transform(value => value.length === 5 ? `${value}:00` : value);

const eventSchema = z.object({
  source_event_id: z.coerce.number().int().positive().optional(),
  id: z.coerce.number().int().positive().optional(), name: text(2, 180), descriptions: text(2, 5000),
  start_date: z.iso.date(), end_date: z.iso.date(), start_time: eventTime, end_time: eventTime,
  event_type: z.enum(["public", "member_only"]),
  file_url: z.string().max(2048).default(""), display_in_homepage: z.boolean(), public_teaser_enabled: z.boolean(),
  booking_mode: z.enum(["none", "website"]),
  lifecycle_status: z.enum(["draft", "published", "cancelled"]),
  booking_capacity: z.coerce.number().int().min(1).max(10000).optional(),
});

const workshopSchema = z.object({
  id: z.string().uuid().optional(), title: text(2, 180), descriptions: text(2, 5000), notes: z.string().trim().max(5000),
  date: z.iso.date(), start_time: eventTime, end_time: eventTime, host_name: text(2, 180), venue: text(2, 240),
  virtual_link: optionalUrl, maximum_participants: z.coerce.number().int().min(1).max(500),
  lifecycle_status: z.enum(["draft", "published", "cancelled"]),
});

const announcementSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: text(2, ANNOUNCEMENT_TITLE_MAX_LENGTH),
  body: text(2, ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH),
  lifecycle_status: z.enum(["draft", "published"]),
});

const bool = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";

async function activeAdministratorCount() {
  const admin = createAdminClient();
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "administrator");
  const ids = (roles ?? []).map(item => item.user_id);
  if (!ids.length) return 0;
  const { count } = await admin.from("users").select("id", { count: "exact", head: true }).in("id", ids).eq("membership_status", "active");
  return count ?? 0;
}

export async function saveEvent(formData: FormData): Promise<{ error: string; field?: string } | { url: string }> {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const parsed = eventSchema.safeParse({
    source_event_id: formData.get("source_event_id") || undefined,
    id: formData.get("id") || undefined, name: formData.get("name"), descriptions: formData.get("descriptions"),
    start_date: formData.get("start_date"), end_date: formData.get("end_date"), start_time: formData.get("start_time"), end_time: formData.get("end_time"),
    event_type: formData.get("event_type"), file_url: formData.get("file_url") || "",
    display_in_homepage: bool(formData, "display_in_homepage"),
    public_teaser_enabled: bool(formData, "public_teaser_enabled"),
    booking_mode: formData.get("booking_mode") || "none",
    lifecycle_status: formData.get("lifecycle_status") || "draft",
    booking_capacity: formData.get("booking_capacity") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, field: String(parsed.error.issues[0].path[0]) };
  if (parsed.data.end_date < parsed.data.start_date) return { error: "The end date cannot be before the start date.", field: "end_date" };
  if (parsed.data.end_date === parsed.data.start_date && parsed.data.end_time <= parsed.data.start_time) return { error: "The end time must be after the start time.", field: "end_time" };
  if (parsed.data.booking_mode === "website" && (parsed.data.event_type !== "public" || !parsed.data.booking_capacity)) {
    return { error: "Website booking needs a public event and a visitor capacity.", field: "booking_capacity" };
  }
  const { id, source_event_id, booking_capacity, ...parsedValues } = parsed.data;
  if (id && source_event_id) return { error: "Choose either editing or duplicating an event." };
  const values = {
    ...parsedValues,
    public_teaser_enabled: parsedValues.event_type === "member_only" && parsedValues.public_teaser_enabled,
    reservation_link: "",
    booking_capacity: parsedValues.booking_mode === "website" ? booking_capacity : null,
    booking_enabled: parsedValues.booking_mode === "website",
    is_ticket_required: parsedValues.booking_mode === "website",
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { data: before } = id ? await admin.from("events").select("name,event_type,lifecycle_status,booking_mode,file_url,public_teaser_enabled").eq("id", id).maybeSingle() : { data: null };
  const quarantinePath = String(formData.get("quarantine_path") || "");
  let copiedImage = false;
  const source = source_event_id ? await admin.from("events").select("file_url").eq("id", source_event_id).maybeSingle() : null;
  if (source_event_id && (source?.error || !source?.data)) return { error: "The original event is no longer available. Create a new event instead." };
  if (!quarantinePath && !before?.file_url && !source?.data?.file_url) return { error: "Add an event image before saving." };
  if (quarantinePath) {
    try {
      values.file_url = (await finalizeQuarantinedUpload("event-image", quarantinePath, user.id)).canonicalPath;
    } catch {
      return { error: "The event image failed validation. Choose another image or try saving again." };
    }
  } else if (source?.data?.file_url) {
    const sourcePath = storageObjectPath(source.data.file_url, "images");
    if (!sourcePath) return { error: "Choose a new image for this event; the original artwork cannot be copied." };
    const destination = `events/${user.id}/${crypto.randomUUID()}.${sourcePath.split(".").pop() || "webp"}`;
    const { error: copyError } = await admin.storage.from("images").copy(sourcePath, destination);
    if (copyError) return { error: "The artwork could not be copied. Choose a new image or try again." };
    values.file_url = `images/${destination}`;
    copiedImage = true;
  } else {
    values.file_url = id ? before?.file_url ?? "" : "";
  }
  const query = id
    ? admin.from("events").update(values).eq("id", id).select("id,lifecycle_status").single()
    : admin.from("events").insert({ ...values, host: user.id }).select("id,lifecycle_status").single();
  const { data: saved, error } = await query;
  if (error) {
    if (quarantinePath || copiedImage) {
      const failedPath = storageObjectPath(values.file_url, "images");
      if (failedPath) await admin.storage.from("images").remove([failedPath]);
    }
    return { error: "The event could not be saved. Your details are still here; please try again." };
  }
  if (quarantinePath) {
    const oldPath = storageObjectPath(before?.file_url, "images");
    if (oldPath && oldPath !== storageObjectPath(values.file_url, "images")) await admin.storage.from("images").remove([oldPath]);
  }
  await writeAudit({ actorUserId: user.id, actorRole: role, action: id ? "event.updated" : "event.created", entityType: "event", entityId: saved.id, before, after: { name: values.name, event_type: values.event_type, lifecycle_status: saved.lifecycle_status, booking_mode: values.booking_mode, public_teaser_enabled: values.public_teaser_enabled } });
  updateTag(MEMBER_DASHBOARD_EVENTS_CACHE_TAG);
  updateTag(PUBLIC_EVENTS_CACHE_TAG);
  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/dashboard"); revalidatePath("/admin/events");
  return { url: `/admin/events?status=${saved.lifecycle_status}&notice=${saved.lifecycle_status === "draft" ? "event-draft-saved" : saved.lifecycle_status === "published" ? "event-published" : "event-saved"}` };
}

export async function deleteEvent(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("events").update({ lifecycle_status: "archived", archived_at: now, archived_by: user.id, updated_at: now }).eq("id", id).neq("lifecycle_status", "archived").select("id,name").maybeSingle();
  if (error) redirect("/admin/events?error=The+event+could+not+be+archived.");
  if (data) await writeAudit({ actorUserId: user.id, actorRole: role, action: "event.archived", entityType: "event", entityId: id, summary: data.name });
  updateTag(MEMBER_DASHBOARD_EVENTS_CACHE_TAG);
  updateTag(PUBLIC_EVENTS_CACHE_TAG);
  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/dashboard"); revalidatePath("/admin/events");
  redirect("/admin/events?status=archived&notice=event-archived");
}

export async function restoreEvent(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await createAdminClient().from("events").update({ lifecycle_status: "draft", archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("id", id).eq("lifecycle_status", "archived").gte("end_date", today).select("id,name").maybeSingle();
  if (error) redirect("/admin/events?status=archived&error=The+event+could+not+be+restored.");
  if (!data) redirect("/admin/events?status=archived&error=Past+events+stay+archived.+Use+Reschedule+to+move+the+dates+forward.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "event.restored", entityType: "event", entityId: id, summary: data.name, after: { lifecycle_status: "draft" } });
  updateTag(MEMBER_DASHBOARD_EVENTS_CACHE_TAG);
  updateTag(PUBLIC_EVENTS_CACHE_TAG);
  revalidatePath("/admin/events");
  redirect("/admin/events?status=draft&notice=event-restored");
}

export async function saveWorkshop(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const parsed = workshopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check all workshop fields." };
  const { id, ...values } = parsed.data;
  const admin = createAdminClient();
  if (values.end_time <= values.start_time) return { error: "The end time must be after the start time." };
  const lifecycle_status = values.lifecycle_status;
  delete (values as Partial<typeof values>).lifecycle_status;
  const updated_at = new Date().toISOString();
  const query = id
    ? admin.from("workshops").update({ ...values, lifecycle_status, updated_at }).eq("id", id).select("id").single()
    : admin.from("workshops").insert({ ...values, lifecycle_status, created_by: user.id }).select("id").single();
  const { data: saved, error } = await query;
  if (error) return { error: "The workshop could not be saved. Please try again." };
  await writeAudit({ actorUserId: user.id, actorRole: role, action: id ? "workshop.updated" : "workshop.created", entityType: "workshop", entityId: saved.id, after: { title: values.title, date: values.date, lifecycle_status } });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/dashboard"); revalidatePath("/admin/workshops");
  return { url: `/admin/workshops?status=${lifecycle_status}&notice=workshop-saved` };
}

export async function saveAnnouncement(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the announcement title and description." };
  const { id, ...values } = parsed.data;
  const admin = createAdminClient();
  const { data: before } = id
    ? await admin.from("announcements").select("title,body,lifecycle_status,published_at").eq("id", id).maybeSingle()
    : { data: null };
  const now = new Date().toISOString();
  const savedValues = {
    ...values,
    published_at: values.lifecycle_status === "published" ? before?.published_at ?? now : null,
    archived_at: null,
    archived_by: null,
    updated_at: now,
  };
  const query = id
    ? admin.from("announcements").update(savedValues).eq("id", id).select("id").single()
    : admin.from("announcements").insert({ ...savedValues, created_by: user.id }).select("id").single();
  const { data: saved, error } = await query;
  if (error || !saved) return { error: "The announcement could not be saved. Your details are still here; please try again." };
  await writeAudit({
    actorUserId: user.id,
    actorRole: role,
    action: id ? "announcement.updated" : "announcement.created",
    entityType: "announcement",
    entityId: saved.id,
    summary: values.title,
    before,
    after: { title: values.title, lifecycle_status: values.lifecycle_status },
  });
  updateTag(ANNOUNCEMENTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/announcements");
  return { url: `/admin/announcements?status=${values.lifecycle_status}&notice=announcement-saved` };
}

export async function archiveAnnouncement(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("announcements")
    .update({ lifecycle_status: "archived", archived_at: now, archived_by: user.id, updated_at: now })
    .eq("id", id)
    .neq("lifecycle_status", "archived")
    .select("id,title")
    .maybeSingle();
  if (error) redirect("/admin/announcements?error=The+announcement+could+not+be+archived.");
  if (data) await writeAudit({ actorUserId: user.id, actorRole: role, action: "announcement.archived", entityType: "announcement", entityId: id, summary: data.title });
  updateTag(ANNOUNCEMENTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/announcements");
}

export async function restoreAnnouncement(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("announcements")
    .update({ lifecycle_status: "draft", published_at: null, archived_at: null, archived_by: null, updated_at: now })
    .eq("id", id)
    .eq("lifecycle_status", "archived")
    .select("id,title")
    .maybeSingle();
  if (error || !data) redirect("/admin/announcements?error=The+announcement+could+not+be+restored.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "announcement.restored", entityType: "announcement", entityId: id, summary: data.title, after: { lifecycle_status: "draft" } });
  updateTag(ANNOUNCEMENTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/announcements");
  redirect("/admin/announcements?status=draft&notice=announcement-restored");
}

export async function deleteOldArchivedAnnouncements() {
  const { user, role } = await requireRole(["administrator"]);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const { data, error } = await createAdminClient().from("announcements")
    .delete()
    .eq("lifecycle_status", "archived")
    .not("archived_at", "is", null)
    .lt("archived_at", cutoff.toISOString())
    .select("id");
  if (error) redirect("/admin/announcements?status=archived&error=Old+archived+announcements+could+not+be+deleted.");
  const deletedIds = (data ?? []).map((announcement) => announcement.id);
  await writeAudit({
    actorUserId: user.id,
    actorRole: role,
    action: "announcements.archives-purged",
    entityType: "announcement-retention",
    entityId: crypto.randomUUID(),
    summary: `${deletedIds.length} archived announcement${deletedIds.length === 1 ? "" : "s"} permanently deleted.`,
    before: { cutoff: cutoff.toISOString(), announcement_ids: deletedIds },
  });
  updateTag(ANNOUNCEMENTS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/news");
  revalidatePath("/admin/announcements");
  redirect("/admin/announcements?status=archived&notice=old-announcements-deleted");
}

export async function deleteWorkshop(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("workshops").update({ lifecycle_status: "archived", archived_at: now, archived_by: user.id, updated_at: now }).eq("id", id).select("id,title").maybeSingle();
  if (error) redirect("/admin/workshops?error=The+workshop+could+not+be+archived.");
  if (data) await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.archived", entityType: "workshop", entityId: id, summary: data.title });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/dashboard"); revalidatePath("/admin/workshops");
}

export async function restoreWorkshop(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { data, error } = await createAdminClient().from("workshops").update({ lifecycle_status: "draft", archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("id", id).eq("lifecycle_status", "archived").select("id,title").maybeSingle();
  if (error || !data) redirect("/admin/workshops?error=The+workshop+could+not+be+restored.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.restored", entityType: "workshop", entityId: id, summary: data.title, after: { lifecycle_status: "draft" } });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/admin/workshops");
}

export async function cancelWorkshopReservation(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("participants").update({ reservation_status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", id).eq("reservation_status", "reserved").select("id,reference_id,participant_id").maybeSingle();
  if (error || !data) redirect("/admin/workshops?error=The+reservation+could+not+be+cancelled.");
  const admin = createAdminClient();
  const { data: workshop } = await admin.from("workshops").select("title,date").eq("id", data.reference_id).maybeSingle();
  const { data: member } = data.participant_id
    ? await admin.from("users").select("full_name,email").eq("id", data.participant_id).maybeSingle()
    : { data: null };
  const mail = workshop && member?.email ? await sendWorkshopReservationUpdate({ email: member.email, memberName: member.full_name || member.email, workshopTitle: workshop.title, workshopDate: workshop.date, reserved: false }) : { sent: false };
  await admin.rpc("record_workshop_email_attempt", { p_reservation_id: id, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.reservation-cancelled", entityType: "workshop-reservation", entityId: id, after: { workshop_id: data.reference_id, participant_id: data.participant_id, status: "cancelled", email_sent: mail.sent } });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/admin/workshops");
  revalidatePath("/dashboard");
  redirect("/admin/workshops?notice=reservation-cancelled");
}

export async function joinWorkshop(formData: FormData) {
  const { user, role } = await requireUser();
  const referenceId = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_workshop_place", { p_workshop_id: referenceId });
  if (error) redirect(`/dashboard?error=${encodeURIComponent(error.message.includes("workshop_full") ? "That workshop is now full." : "The workshop place could not be reserved.")}`);
  const admin = createAdminClient();
  const [{ data: workshop }, { data: profile }] = await Promise.all([
    admin.from("workshops").select("title,date").eq("id", referenceId).maybeSingle(),
    admin.from("users").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const mail = workshop && user.email ? await sendWorkshopReservationUpdate({ email: user.email, memberName: profile?.full_name || user.email, workshopTitle: workshop.title, workshopDate: workshop.date, reserved: true }) : { sent: false };
  const reservationId = data?.[0]?.reservation_id;
  if (reservationId) await admin.rpc("record_workshop_email_attempt", { p_reservation_id: reservationId, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.reserved", entityType: "workshop", entityId: referenceId, after: { reservation_id: data?.[0]?.reservation_id, email_sent: mail.sent } });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/dashboard");
}

export async function leaveWorkshop(formData: FormData) {
  const { user, role } = await requireUser();
  const referenceId = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { data: cancelled } = await supabase.rpc("cancel_workshop_place", { p_workshop_id: referenceId });
  const admin = createAdminClient();
  const [{ data: workshop }, { data: profile }] = await Promise.all([
    admin.from("workshops").select("title,date").eq("id", referenceId).maybeSingle(),
    admin.from("users").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const mail = cancelled && workshop && user.email ? await sendWorkshopReservationUpdate({ email: user.email, memberName: profile?.full_name || user.email, workshopTitle: workshop.title, workshopDate: workshop.date, reserved: false }) : { sent: false };
  const { data: reservation } = await admin.from("participants").select("id").eq("reference_id", referenceId).eq("participant_id", user.id).maybeSingle();
  if (cancelled && reservation) await admin.rpc("record_workshop_email_attempt", { p_reservation_id: reservation.id, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.reservation-cancelled-own", entityType: "workshop", entityId: referenceId, after: { cancelled, email_sent: mail.sent } });
  updateTag(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG);
  revalidatePath("/dashboard");
}

export async function retryWorkshopReservationEmail(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data: reservation, error } = await admin.from("participants")
    .select("id,reference_id,participant_id,reservation_status")
    .eq("id", id)
    .maybeSingle();
  if (error || !reservation) redirect("/admin/workshops?error=The+reservation+was+not+found.");
  if (!reservation.participant_id) redirect("/admin/workshops?error=The+former+member%27s+delivery+details+have+been+removed.");
  const [{ data: workshop }, { data: member }] = await Promise.all([
    admin.from("workshops").select("title,date").eq("id", reservation.reference_id).maybeSingle(),
    admin.from("users").select("full_name,email").eq("id", reservation.participant_id).maybeSingle(),
  ]);
  if (!workshop || !member?.email) redirect("/admin/workshops?error=The+delivery+details+are+not+available.");
  const mail = await sendWorkshopReservationUpdate({
    email: member.email,
    memberName: member.full_name || member.email,
    workshopTitle: workshop.title,
    workshopDate: workshop.date,
    reserved: reservation.reservation_status === "reserved",
  });
  await admin.rpc("record_workshop_email_attempt", { p_reservation_id: id, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "workshop.reservation-email-retried", entityType: "workshop-reservation", entityId: id, after: { sent: mail.sent, status: reservation.reservation_status } });
  revalidatePath("/admin/workshops");
  redirect(mail.sent ? "/admin/workshops?notice=reservation-email-sent" : "/admin/workshops?error=Workshop+email+delivery+failed.+Try+again+later.");
}

export async function createMessage(formData: FormData) {
  const { user, role } = await requireUser();
  const parsed = z.object({ title: text(2, 120), message: text(2, 2000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard?error=Please+write+a+title+and+message.");
  if (!await consumeRateLimit("member-notice", 5, 60 * 60, user.id)) redirect("/dashboard?error=You+have+posted+too+many+notices.+Please+try+again+later.");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { data, error } = await admin.from("feeds").insert({ type: "message", ...parsed.data, author_id: user.id, author_name: profile?.full_name || user.email, lifecycle_status: "published" }).select("id").single();
  if (error) redirect("/dashboard?error=The+notice+could+not+be+posted.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "notice.created", entityType: "notice", entityId: data.id, summary: parsed.data.title });
  revalidatePath("/dashboard");
}

export async function deleteMessage(formData: FormData) {
  const { user, role } = await requireUser();
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data } = await admin.from("feeds").select("author_id").eq("id", id).single();
  if (data?.author_id !== user.id && !canManageContent(role)) redirect("/dashboard?error=You+cannot+remove+that+message.");
  const now = new Date().toISOString();
  await admin.from("feeds").update({ lifecycle_status: data?.author_id === user.id ? "archived" : "moderated", archived_at: now, archived_by: user.id, updated_at: now }).eq("id", id);
  await writeAudit({ actorUserId: user.id, actorRole: role, action: data?.author_id === user.id ? "notice.archived" : "notice.moderated", entityType: "notice", entityId: id });
  revalidatePath("/dashboard");
}

export async function restoreMessage(formData: FormData) {
  const { user, role } = await requireUser();
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const { data, error } = await createAdminClient().from("feeds").update({ lifecycle_status: "published", archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("id", id).eq("author_id", user.id).eq("lifecycle_status", "archived").select("id,title").maybeSingle();
  if (error || !data) redirect("/dashboard?error=That+notice+could+not+be+restored.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "notice.restored", entityType: "notice", entityId: id, summary: data.title || "" });
  revalidatePath("/dashboard");
}

export async function uploadDocument(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const quarantinePath = String(formData.get("quarantine_path") || "");
  const category = z.enum(["minute", "publication", "insurance-policy", "club-rule", "calendar", "boiler-guide", "others"]).safeParse(formData.get("category"));
  const name = text(2, 180).safeParse(formData.get("name"));
  if (!quarantinePath || !category.success || !name.success) return { error: "Choose a PDF and enter a document name of at least two characters." };
  const admin = createAdminClient();
  let upload: Awaited<ReturnType<typeof finalizeQuarantinedUpload>>;
  try { upload = await finalizeQuarantinedUpload("document", quarantinePath, user.id); }
  catch { return { error: "The PDF failed security validation. Please choose a valid PDF again.", reselectFile: true }; }
  const { data, error } = await admin.from("documents").insert({ name: name.data, descriptions: String(formData.get("descriptions") || "").slice(0, 5000), category: category.data, file_url: upload.canonicalPath, created_by: user.id, lifecycle_status: "published" }).select("id").single();
  if (error) { await admin.storage.from("documents").remove([upload.path]); return { error: "The document could not be saved. Please choose the PDF again and retry.", reselectFile: true }; }
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.created", entityType: "document", entityId: data.id, summary: name.data, after: { category: category.data, path: upload.canonicalPath } });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
  const section = category.data === "minute" ? "minutes" : category.data === "publication" ? "publications" : "resources";
  return { url: `/dashboard/${section}?status=published` };
}

export async function deleteDocument(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("documents").update({ lifecycle_status: "archived", archived_at: now, archived_by: user.id, updated_at: now }).eq("id", id).select("id,name").maybeSingle();
  if (error) redirect("/dashboard/resources?error=The+document+could+not+be+archived.");
  if (data) await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.archived", entityType: "document", entityId: id, summary: data.name });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
}

export async function restoreDocument(formData: FormData) {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { data, error } = await createAdminClient().from("documents").update({ lifecycle_status: "published", archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("id", id).eq("lifecycle_status", "archived").select("id,name").maybeSingle();
  if (error || !data) redirect("/dashboard/resources?error=The+document+could+not+be+restored.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.restored", entityType: "document", entityId: id, summary: data.name });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
}

export async function updateDocumentMetadata(formData: FormData): Promise<{ error?: string; success?: boolean; reselectFile?: boolean }> {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const parsed = z.object({ id: z.string().uuid(), name: text(2, 180), descriptions: z.string().trim().max(5000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the document name and description." };
  const { data: before } = await createAdminClient().from("documents").select("name,descriptions").eq("id", parsed.data.id).maybeSingle();
  const { data, error } = await createAdminClient().from("documents").update({ name: parsed.data.name, descriptions: parsed.data.descriptions, updated_at: new Date().toISOString() }).eq("id", parsed.data.id).select("id").maybeSingle();
  if (error || !data) return { error: "The document could not be updated. Please try again." };
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.metadata-updated", entityType: "document", entityId: data.id, before, after: { name: parsed.data.name, descriptions: parsed.data.descriptions } });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function replaceDocumentVersion(formData: FormData): Promise<{ error?: string; success?: boolean; reselectFile?: boolean }> {
  const { user, role } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const quarantinePath = String(formData.get("quarantine_path") || "");
  if (!quarantinePath) return { error: "Choose a replacement PDF before saving." };
  const admin = createAdminClient();
  const { data: before } = await admin.from("documents").select("file_url,version,name").eq("id", id).maybeSingle();
  if (!before) return { error: "This document could not be found. Refresh the page and try again." };
  let upload: Awaited<ReturnType<typeof finalizeQuarantinedUpload>>;
  try { upload = await finalizeQuarantinedUpload("document", quarantinePath, user.id); }
  catch { return { error: "The replacement PDF failed security validation. Please choose a valid PDF again.", reselectFile: true }; }
  const { data, error } = await admin.from("documents").update({ file_url: upload.canonicalPath, version: before.version + 1, updated_at: new Date().toISOString() }).eq("id", id).eq("version", before.version).select("id").maybeSingle();
  if (error || !data) {
    await admin.storage.from("documents").remove([upload.path]);
    return { error: "The document changed while you were editing it. Please choose the PDF again and retry.", reselectFile: true };
  }
  const oldPath = before.file_url.startsWith("documents/") ? before.file_url.slice("documents/".length) : before.file_url;
  if (oldPath && !oldPath.includes("..")) await admin.storage.from("documents").remove([oldPath]);
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.version-replaced", entityType: "document", entityId: id, summary: before.name, before: { version: before.version, path: before.file_url }, after: { version: before.version + 1, path: upload.canonicalPath } });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function purgeDocument(formData: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const parsed = z.object({ id: z.string().uuid(), confirmation: z.literal("DELETE DOCUMENT") }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard/resources?error=Type+PURGE+DOCUMENT+to+confirm.");
  const admin = createAdminClient();
  const { data: doc } = await admin.from("documents").select("id,name,file_url,lifecycle_status,version").eq("id", parsed.data.id).maybeSingle();
  if (!doc || doc.lifecycle_status !== "archived") redirect("/dashboard/resources?error=Only+archived+documents+can+be+purged.");
  const path = storageObjectPath(doc.file_url, "documents");
  if (path) {
    const { error: storageError } = await admin.storage.from("documents").remove([path]);
    if (storageError) redirect("/dashboard/resources?error=The+document+file+could+not+be+purged.");
  }
  const { data: deleted, error } = await admin.from("documents").delete().eq("id", doc.id).eq("lifecycle_status", "archived").select("id").maybeSingle();
  if (error || !deleted) redirect("/dashboard/resources?error=The+document+could+not+be+purged.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "document.purged", entityType: "document", entityId: doc.id, summary: doc.name, before: { version: doc.version, path: doc.file_url } });
  updateTag(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG);
  revalidatePath("/dashboard", "layout");
}

export async function updateProfile(formData: FormData) {
  await requireUser();
  const parsed = z.object({ full_name: text(2, 180), title: z.string().trim().max(10), contact_number: z.string().trim().max(40) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/account?error=Please+check+your+profile+details.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_member_profile", {
    p_title: parsed.data.title,
    p_full_name: parsed.data.full_name,
    p_contact_number: parsed.data.contact_number,
  });
  if (error) redirect("/account?error=The+profile+could+not+be+updated.");
  revalidatePath("/account"); revalidatePath("/dashboard", "layout");
  redirect("/account?notice=profile-updated");
}

export async function inviteMember(formData: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const email = z.string().trim().email().max(254).safeParse(formData.get("email"));
  const fullName = text(2, 180).safeParse(formData.get("full_name"));
  if (!email.success || !fullName.success) return { error: "Enter a valid name and email address." };
  if (!await consumeRateLimit("member-invitation", 30, 60 * 60, user.id)) return { error: "Invitation limit reached. Please try again later." };
  const origin = getTrustedAppOrigin();
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email.data, { data: { full_name: fullName.data }, redirectTo: `${origin}/auth/invite?next=/reset-password` });
  if (error) return { error: "The invitation could not be sent. Check the email address and try again." };
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "member.invited", entityType: "member-invitation", entityId: email.data.toLowerCase(), summary: fullName.data });
  revalidatePath("/admin/members");
  return { success: true };
}

async function requireMemberStatusManager() {
  const session = await requireUser();
  if (session.role !== "administrator" && !session.membershipOfficer) {
    redirect("/dashboard?notice=not-authorised");
  }
  return session;
}

export async function deleteMember(formData: FormData) {
  const { user, role } = await requireMemberStatusManager();
  const userId = idString.parse(formData.get("user_id"));
  if (userId === user.id) redirect("/admin/members?error=You+cannot+archive+your+own+account.");
  const admin = createAdminClient();
  const { data: targetRole } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role !== "administrator" && (targetRole?.role ?? "member") !== "member") {
    redirect("/admin/members?error=Only+an+administrator+can+archive+a+committee+member+or+administrator.");
  }
  if (targetRole?.role === "administrator") {
    if (await activeAdministratorCount() <= 2) redirect("/admin/members?error=At+least+two+active+administrators+are+required.+Promote+another+member+before+archiving+this+account.");
  }
  const now = new Date().toISOString();
  const retentionUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("users").update({ membership_status: "archived", archived_at: now, archived_by: user.id, retention_until: retentionUntil, updated_at: now }).eq("id", userId).select("id,email").maybeSingle();
  if (error) redirect("/admin/members?error=The+member+could+not+be+archived.");
  if (data) await writeAudit({ actorUserId: user.id, actorRole: role, action: "member.archived", entityType: "member", entityId: userId, summary: data.email });
  revalidatePath("/admin/members");
  redirect("/admin/members?notice=member-archived");
}

export async function restoreMember(formData: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const userId = idString.parse(formData.get("user_id"));
  const now = new Date().toISOString();
  const { data, error } = await createAdminClient().from("users").update({ membership_status: "active", archived_at: null, archived_by: null, retention_until: null, updated_at: now }).eq("id", userId).neq("membership_status", "active").is("retention_purge_claimed_at", null).select("id,email").maybeSingle();
  if (error || !data) redirect("/admin/members?error=The+member+could+not+be+restored.+An+automatic+retention+operation+may+be+in+progress.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "member.restored", entityType: "member", entityId: userId, summary: data.email });
  revalidatePath("/admin/members");
  redirect("/admin/members?notice=member-restored");
}

export async function suspendMember(formData: FormData) {
  const { user, role } = await requireMemberStatusManager();
  const userId = idString.parse(formData.get("user_id"));
  if (userId === user.id) redirect("/admin/members?error=You+cannot+suspend+your+own+account.");
  const admin = createAdminClient();
  const { data: targetRole } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role !== "administrator" && (targetRole?.role ?? "member") !== "member") {
    redirect("/admin/members?error=Only+an+administrator+can+suspend+a+committee+member+or+administrator.");
  }
  if (targetRole?.role === "administrator") redirect("/admin/members?error=Demote+an+administrator+before+suspending+their+access.");
  const { data, error } = await admin.from("users").update({ membership_status: "suspended", updated_at: new Date().toISOString() }).eq("id", userId).eq("membership_status", "active").select("id,email").maybeSingle();
  if (error || !data) redirect("/admin/members?error=The+member+could+not+be+suspended.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "member.suspended", entityType: "member", entityId: userId, summary: data.email });
  revalidatePath("/admin/members");
  redirect("/admin/members?notice=member-suspended");
}

export async function purgeMember(formData: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const parsed = z.object({
    user_id: z.string().uuid(),
    confirmation: z.string().max(400),
    password: z.string().min(1).max(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.user_id === user.id) redirect("/admin/members?error=Invalid+permanent+deletion+request.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("id,email,membership_status,legal_hold").eq("id", parsed.data.user_id).maybeSingle();
  if (!target || target.membership_status !== "archived") redirect("/admin/members?error=Only+archived+members+can+be+permanently+deleted.");
  if (target.legal_hold) redirect("/admin/members?error=This+member+is+under+legal+hold+and+cannot+be+deleted.");
  if (parsed.data.confirmation !== `DELETE ${target.email}`) redirect("/admin/members?error=The+typed+confirmation+did+not+match.");
  // Archived targets are already excluded from the active-administrator count.
  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email || "", password: parsed.data.password });
  if (reauthError) redirect("/admin/members?error=Reauthentication+failed.");
  const { data: anonymized, error: anonymizeError } = await admin.rpc("anonymize_member_content_for_purge", {
    p_actor_id: user.id,
    p_user_id: target.id,
  });
  if (anonymizeError?.message.includes("member_purge_privileged_role")) {
    redirect("/admin/members?error=Remove+the+member%27s+privileged+role+and+committee+listing+before+deletion.");
  }
  if (anonymizeError || !anonymized) redirect("/admin/members?error=Member+content+could+not+be+anonymised.");
  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id, false);
  if (deleteError) redirect("/admin/members?error=Permanent+deletion+failed.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "member.purged", entityType: "member", entityId: target.id, summary: "Permanently deleted member account.", before: { membership_status: target.membership_status } });
  revalidatePath("/admin/members");
  redirect("/admin/members?notice=member-purged");
}

export async function saveSiteConfig(formData: FormData) {
  const { user, role } = await requireRole(["administrator"]);
  const parsed = z.object({
    id: z.coerce.number().int().positive(), short_name: text(2, 30), full_name: text(2, 240),
    registered_name: text(2, 240), company_no: text(1, 50), website: httpUrl,
    email: z.string().trim().email().max(254), telephone: z.string().trim().max(50),
    club_address_line_one: text(1, 180), club_address_line_two: z.string().trim().max(180),
    club_city: text(1, 100), club_postcode: text(1, 20), club_country: text(1, 100),
    registered_address_line_one: text(1, 180), registered_address_line_two: z.string().trim().max(180),
    registered_city: text(1, 100), registered_postcode: text(1, 20), registered_country: text(1, 100),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/settings?tab=site&error=Please+check+the+Society+details.");
  const socialNames = formData.getAll("social_name").map(String);
  const socialLinks = formData.getAll("social_link").map(String);
  const affiliateNames = formData.getAll("affiliate_name").map(String);
  const affiliateLinks = formData.getAll("affiliate_website").map(String);
  const affiliateLogos = formData.getAll("affiliate_logo").map(String);
  const socials = z.array(z.object({ name: text(1, 60), link: optionalUrl })).safeParse(socialNames.map((name, index) => ({ name, link: socialLinks[index] || "" })));
  const affiliates = z.array(z.object({ name: text(1, 120), website: optionalUrl, logo: z.string().max(2048) })).safeParse(affiliateNames.map((name, index) => ({ name, website: affiliateLinks[index] || "", logo: affiliateLogos[index] || "" })));
  if (!socials.success || !affiliates.success) redirect("/settings?tab=site&error=Social+or+affiliate+links+are+invalid.");
  const {
    id,
    club_address_line_one,
    club_address_line_two,
    club_city,
    club_postcode,
    club_country,
    registered_address_line_one,
    registered_address_line_two,
    registered_city,
    registered_postcode,
    registered_country,
    ...values
  } = parsed.data;
  const admin = createAdminClient();
  const { data: before } = await admin.from("configs").select("short_name,full_name,registered_name,company_no,website,email,telephone,club_address,registered_address,socials,affiliates").eq("id", id).maybeSingle();
  const after = {
    ...values,
    club_address: {
      address_line_one: club_address_line_one,
      address_line_two: club_address_line_two,
      city: club_city,
      postcode: club_postcode,
      country: club_country,
    },
    registered_address: {
      address_line_one: registered_address_line_one,
      address_line_two: registered_address_line_two,
      city: registered_city,
      postcode: registered_postcode,
      country: registered_country,
    },
    socials: socials.data,
    affiliates: affiliates.data,
  };
  const { data: saved, error } = await admin.from("configs").update(after).eq("id", id).select("id").maybeSingle();
  if (error || !saved) redirect("/settings?tab=site&error=Society+settings+could+not+be+saved.");
  const { error: linkError } = await admin.rpc("replace_public_site_links", { p_socials: socials.data, p_affiliates: affiliates.data });
  if (linkError) redirect("/settings?tab=site&error=Society+details+were+saved,+but+public+links+could+not+be+updated.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "site-settings.updated", entityType: "site-config", entityId: id, before, after });
  updateTag(PUBLIC_SITE_CONFIG_CACHE_TAG);
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  redirect("/settings?tab=site&notice=config-saved");
}

export async function saveDonationSettings(formData: FormData) {
  const { user, role } = await requireCapability("donations.manage");
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
    generic_title: text(2, 120),
    generic_description: text(2, 500),
    generic_button_label: text(2, 40),
    target_title: text(2, 120),
    target_description: text(2, 500),
    target_button_label: text(2, 40),
    target_pounds: z.coerce.number().min(1).max(10_000_000),
  }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/admin/donations?view=appeals&error=invalid");
  }

  const genericEnabled = bool(formData, "generic_enabled");
  const targetEnabled = bool(formData, "target_enabled");
  if ((genericEnabled || targetEnabled) && !process.env.STRIPE_SECRET_KEY) {
    redirect("/admin/donations?view=appeals&error=payment-configuration");
  }

  const admin = createAdminClient();
  const { data: config, error: readError } = await admin
    .from("configs")
    .select("settings")
    .eq("id", parsed.data.id)
    .single();
  if (readError) redirect("/admin/donations?view=appeals&error=load");

  const currentSettings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings
    : {};
  const settings = {
    ...currentSettings,
    donations: {
      generic: {
        enabled: genericEnabled,
        title: parsed.data.generic_title,
        description: parsed.data.generic_description,
        buttonLabel: parsed.data.generic_button_label,
      },
      target: {
        enabled: targetEnabled,
        title: parsed.data.target_title,
        description: parsed.data.target_description,
        buttonLabel: parsed.data.target_button_label,
        targetPence: Math.round(parsed.data.target_pounds * 100),
      },
    },
  };

  const { error } = await admin.from("configs").update({ settings }).eq("id", parsed.data.id);
  if (error) redirect("/admin/donations?view=appeals&error=save");
  const { error: campaignError } = await admin.rpc("replace_donation_campaigns", { p_generic: settings.donations.generic, p_target: settings.donations.target });
  if (campaignError) redirect("/admin/donations?view=appeals&error=save");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "donation-campaigns.updated", entityType: "site-config", entityId: parsed.data.id, before: { donations: currentSettings.donations }, after: { donations: settings.donations } });
  updateTag(PUBLIC_DONATIONS_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/visitors");
  revalidatePath("/settings");
  redirect("/admin/donations?view=appeals&notice=donations-saved");
}
