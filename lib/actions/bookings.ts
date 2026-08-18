"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { sendBookingConfirmation } from "@/lib/booking-email";
import { createAdminClient } from "@/lib/supabase/admin";

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
  partySize: z.coerce.number().int().min(1).max(20),
  website: z.string().max(0),
});

function bookingReference() {
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `YME-${token.slice(0, 5)}-${token.slice(5)}`;
}

async function verifyTurnstile(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = new URLSearchParams({ secret, response: token });
  if (forwarded) body.set("remoteip", forwarded);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
    });
    const result = await response.json() as { success?: boolean };
    return response.ok && result.success === true;
  } catch {
    return false;
  }
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
    const { data, error } = await admin.rpc("create_event_booking", {
      p_event_id: parsed.data.eventId,
      p_lead_name: parsed.data.leadName,
      p_email: parsed.data.email,
      p_party_size: parsed.data.partySize,
      p_reference_code: bookingReference(),
    });
    booking = data?.[0];
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

  await admin.from("event_bookings").update({
    confirmation_email_sent_at: email.sent ? new Date().toISOString() : null,
    confirmation_email_error: email.sent ? null : email.error.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("id", booking.booking_id);

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
  const { user } = await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { error } = await createAdminClient().from("event_bookings").update({
    status: "checked_in",
    checked_in_at: new Date().toISOString(),
    checked_in_by: user.id,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "confirmed");
  if (error) redirect(`/admin/bookings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings?notice=checked-in");
}

export async function undoBookingCheckIn(formData: FormData) {
  await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { error } = await createAdminClient().from("event_bookings").update({
    status: "confirmed",
    checked_in_at: null,
    checked_in_by: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("status", "checked_in");
  if (error) redirect(`/admin/bookings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/bookings");
  redirect("/admin/bookings?notice=check-in-undone");
}

export async function resendBookingConfirmation(formData: FormData) {
  await requireRole(["administrator", "committee"]);
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
  await admin.from("event_bookings").update({
    confirmation_email_sent_at: result.sent ? new Date().toISOString() : null,
    confirmation_email_error: result.sent ? null : result.error.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("id", booking.id);
  revalidatePath("/admin/bookings");
  if (!result.sent) redirect(`/admin/bookings?error=${encodeURIComponent(result.error)}`);
  redirect("/admin/bookings?notice=email-sent");
}
