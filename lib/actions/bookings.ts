"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireCapability } from "@/lib/auth";
import { bookingAbuseIdentifiers } from "@/lib/booking-abuse";
import { sendBookingCancellation, sendBookingConfirmation } from "@/lib/booking-email";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";

export type BookingActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  referenceCode?: string;
  eventName?: string;
  eventDate?: string;
  startTime?: string;
  partySize?: number;
  emailSent?: boolean;
};

const bookingSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  leadName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  partySize: z.coerce.number().int().min(1).max(6),
  website: z.string().max(0),
});

function bookingReference() {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `YME-${token.slice(0, 5)}-${token.slice(5)}`;
}

function bookingError(message?: string): BookingActionState {
  if (message?.includes("booking_exists")) {
    return { status: "error", message: "That email address already has a booking for this event. Please check your confirmation email or contact the Society." };
  }
  if (message?.includes("insufficient_capacity")) {
    return { status: "error", message: "There are not enough places left for that group size. Please choose a smaller number." };
  }
  if (message?.includes("booking_closed")) {
    return { status: "error", message: "Booking for this event is no longer available." };
  }
  if (message?.includes("booking_automatic_limit")) {
    return { status: "error", message: "We couldn’t accept another booking automatically. If these places are for a separate group, please contact YDSME." };
  }
  return { status: "error", message: "We could not complete the booking. Please try again." };
}

export async function createVisitorBooking(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = bookingSchema.safeParse({
    eventId: formData.get("eventId"),
    leadName: formData.get("leadName"),
    email: formData.get("email"),
    partySize: formData.get("partySize"),
    website: formData.get("website") || "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Enter your name, a valid email address and the number of visitors." };
  }

  const captchaValid = await verifyTurnstile(String(formData.get("captchaToken") || ""));
  if (!captchaValid) {
    return { status: "error", message: "Please complete the security check and try again." };
  }
  const permitted = await consumeRateLimit("visitor-booking", 6, 15 * 60, parsed.data.email);
  if (!permitted) {
    return { status: "error", message: "Too many booking attempts. Please wait and try again." };
  }
  let abuseIdentifiers: Awaited<ReturnType<typeof bookingAbuseIdentifiers>>;
  try {
    abuseIdentifiers = await bookingAbuseIdentifiers(parsed.data.eventId);
  } catch {
    return { status: "error", message: "We could not complete the booking. Please try again." };
  }

  const admin = createAdminClient();
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id,name,start_date,start_time,end_date,event_type,booking_enabled,booking_capacity")
    .eq("id", parsed.data.eventId)
    .eq("event_type", "public")
    .maybeSingle();
  if (eventError || !event || !event.booking_enabled || !event.booking_capacity) {
    return bookingError("booking_closed");
  }

  let booking: { booking_id: string; reference_code: string; available_places: number } | undefined;
  let rpcError: { message: string; code?: string } | null = null;
  for (let attempt = 0; attempt < 2 && !booking; attempt += 1) {
    const { data, error } = await admin.rpc("create_event_booking_v2", {
      p_device_hash: abuseIdentifiers.deviceHash,
      p_event_id: parsed.data.eventId,
      p_lead_name: parsed.data.leadName,
      p_email: parsed.data.email,
      p_ip_hash: abuseIdentifiers.ipHash as string,
      p_party_size: parsed.data.partySize,
      p_reference_code: bookingReference(),
    });
    const result = data?.[0];
    if (result?.outcome === "blocked") return bookingError("booking_automatic_limit");
    if (result?.outcome === "accepted" && result.booking_id && result.reference_code) {
      booking = {
        booking_id: result.booking_id,
        reference_code: result.reference_code,
        available_places: result.available_places,
      };
    }
    rpcError = error;
    if (error?.code !== "23505") break;
  }
  if (!booking || rpcError) return bookingError(rpcError?.message);

  const email = await sendBookingConfirmation({
    bookingId: booking.booking_id,
    eventId: event.id,
    referenceCode: booking.reference_code,
    leadName: parsed.data.leadName,
    email: parsed.data.email,
    partySize: parsed.data.partySize,
    eventName: event.name,
    eventDate: event.start_date,
    startTime: event.start_time,
  });

  await admin.rpc("record_event_booking_email_attempt", { p_booking_id: booking.booking_id, p_sent: email.sent, p_error: email.sent ? "" : "Delivery failed." });

  revalidatePath("/events");
  revalidatePath(`/events/${event.id}/book`);
  revalidatePath("/admin/bookings");

  return {
    status: "success",
    referenceCode: booking.reference_code,
    eventName: event.name,
    eventDate: event.start_date,
    startTime: event.start_time.slice(0, 5),
    partySize: parsed.data.partySize,
    emailSent: email.sent,
  };
}

export async function checkInBooking(formData: FormData) {
  const { user, role } = await requireCapability("bookings.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data, error } = await admin.from("event_bookings").update({
    status: "checked_in",
    checked_in_at: new Date().toISOString(),
    checked_in_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "confirmed").select("id,event_id,reference_code").maybeSingle();
  if (error || !data) redirect("/admin/bookings?error=Booking+could+not+be+checked+in.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "booking.check-in", entityType: "event_booking", entityId: id, after: { status: "checked_in", reference_code: data.reference_code } });
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings?notice=checked-in");
}

export async function undoBookingCheckIn(formData: FormData) {
  const { user, role } = await requireCapability("bookings.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const { data, error } = await createAdminClient().from("event_bookings").update({
    status: "confirmed",
    checked_in_at: null,
    checked_in_by: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "checked_in").select("id,reference_code").maybeSingle();
  if (error || !data) redirect("/admin/bookings?error=Check-in+could+not+be+reversed.");
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "booking.undo-check-in", entityType: "event_booking", entityId: id, after: { status: "confirmed", reference_code: data.reference_code } });
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings?notice=check-in-undone");
}

export async function resendBookingConfirmation(formData: FormData) {
  const { user, role } = await requireCapability("bookings.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("event_bookings")
    .select("id,reference_code,lead_name,email,party_size,event_id")
    .eq("id", id)
    .single();
  if (error || !booking) redirect("/admin/bookings?error=Booking+not+found.");
  const { data: event, error: eventError } = await admin.from("events")
    .select("name,start_date,start_time")
    .eq("id", booking.event_id)
    .single();
  if (eventError || !event) redirect("/admin/bookings?error=Event+not+found.");

  const result = await sendBookingConfirmation({
    bookingId: booking.id,
    eventId: booking.event_id,
    referenceCode: booking.reference_code,
    leadName: booking.lead_name,
    email: booking.email,
    partySize: booking.party_size,
    eventName: event.name,
    eventDate: event.start_date,
    startTime: event.start_time,
  }, { resend: true });
  await admin.rpc("record_event_booking_email_attempt", { p_booking_id: booking.id, p_sent: result.sent, p_error: result.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "booking.resend-confirmation", entityType: "event_booking", entityId: booking.id, after: { sent: result.sent, reference_code: booking.reference_code } });
  revalidatePath("/admin/bookings");
  if (!result.sent) redirect("/admin/bookings?error=Email+delivery+failed.+The+booking+is+unchanged.");
  redirect("/admin/bookings?notice=email-sent");
}

export async function cancelBooking(formData: FormData) {
  const { user, role } = await requireCapability("bookings.manage");
  const parsed = z.object({
    id: z.string().uuid(),
    reason: z.string().trim().max(500).default(""),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/bookings?error=Invalid+cancellation+request.");

  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("event_bookings")
    .select("id,event_id,reference_code,lead_name,email,party_size,status")
    .eq("id", parsed.data.id)
    .in("status", ["confirmed", "checked_in"])
    .maybeSingle();
  if (error || !booking) redirect("/admin/bookings?error=Active+booking+not+found.");
  const { data: event, error: eventError } = await admin.from("events")
    .select("name,start_date,start_time")
    .eq("id", booking.event_id)
    .single();
  if (eventError || !event) redirect("/admin/bookings?error=Event+not+found.");

  const now = new Date().toISOString();
  const { data: changed, error: changeError } = await admin.from("event_bookings").update({
    status: "cancelled",
    cancelled_at: now,
    cancelled_by: user.id,
    cancellation_reason: parsed.data.reason || null,
    checked_in_at: null,
    checked_in_by: null,
    updated_at: now,
  }).eq("id", booking.id).eq("status", booking.status).select("id").maybeSingle();
  if (changeError || !changed) redirect("/admin/bookings?error=Booking+state+changed.+Refresh+and+try+again.");

  const mail = await sendBookingCancellation({
    bookingId: booking.id,
    eventId: booking.event_id,
    referenceCode: booking.reference_code,
    leadName: booking.lead_name,
    email: booking.email,
    partySize: booking.party_size,
    eventName: event.name,
    eventDate: event.start_date,
    startTime: event.start_time,
  }, parsed.data.reason);
  await admin.rpc("record_event_booking_email_attempt", { p_booking_id: booking.id, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "booking.cancel", entityType: "event_booking", entityId: booking.id, before: { status: booking.status }, after: { status: "cancelled", reason: parsed.data.reason, email_sent: mail.sent } });
  revalidatePath("/admin/bookings");
  redirect(mail.sent ? "/admin/bookings?notice=cancelled" : "/admin/bookings?notice=cancelled-email-failed");
}

export async function resendBookingCancellation(formData: FormData) {
  const { user, role } = await requireCapability("bookings.manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("event_bookings")
    .select("id,event_id,reference_code,lead_name,email,party_size,cancellation_reason,status")
    .eq("id", id)
    .eq("status", "cancelled")
    .maybeSingle();
  if (error || !booking) redirect("/admin/bookings?error=Cancelled+booking+not+found.");
  const { data: event, error: eventError } = await admin.from("events")
    .select("name,start_date,start_time")
    .eq("id", booking.event_id)
    .single();
  if (eventError || !event) redirect("/admin/bookings?error=Event+not+found.");
  const mail = await sendBookingCancellation({
    bookingId: booking.id,
    eventId: booking.event_id,
    referenceCode: booking.reference_code,
    leadName: booking.lead_name,
    email: booking.email,
    partySize: booking.party_size,
    eventName: event.name,
    eventDate: event.start_date,
    startTime: event.start_time,
  }, booking.cancellation_reason || undefined);
  await admin.rpc("record_event_booking_email_attempt", { p_booking_id: booking.id, p_sent: mail.sent, p_error: mail.sent ? "" : "Delivery failed." });
  await writeAudit({ actorUserId: user.id, actorRole: role, action: "booking.resend-cancellation", entityType: "event_booking", entityId: booking.id, after: { sent: mail.sent, reference_code: booking.reference_code } });
  revalidatePath("/admin/bookings");
  redirect(mail.sent ? "/admin/bookings?notice=cancellation-email-sent" : "/admin/bookings?error=Cancellation+email+delivery+failed.+Try+again+later.");
}
