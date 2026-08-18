import "server-only";

import { generateBookingTicket } from "./booking-ticket";

export type BookingEmailDetails = {
  bookingId: string;
  eventId: number;
  referenceCode: string;
  leadName: string;
  email: string;
  partySize: number;
  eventName: string;
  eventDate: string;
  startTime: string;
};

type EmailResult = { sent: true } | { sent: false; error: string };

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function readableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export async function sendBookingConfirmation(
  details: BookingEmailDetails,
  options: { resend?: boolean } = {},
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKINGS_FROM_EMAIL;
  if (!apiKey || !from) {
    return { sent: false, error: "Booking email is not configured." };
  }

  const eventDate = readableDate(details.eventDate);
  const startTime = details.startTime.slice(0, 5);
  const name = escapeHtml(details.leadName);
  const eventName = escapeHtml(details.eventName);
  const referenceCode = escapeHtml(details.referenceCode);
  const people = `${details.partySize} ${details.partySize === 1 ? "person" : "people"}`;
  const replyTo = process.env.BOOKINGS_REPLY_TO;
  const idempotencyKey = options.resend
    ? `booking-${details.bookingId}-resend-${Date.now()}`
    : `booking-${details.bookingId}-confirmation`;

  try {
    const ticket = await generateBookingTicket({
      bookingId: details.bookingId,
      eventId: details.eventId,
      eventName: details.eventName,
      eventDate: details.eventDate,
      startTime: details.startTime,
      leadName: details.leadName,
      partySize: details.partySize,
      referenceCode: details.referenceCode,
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [details.email],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: `Your mobile ticket: ${details.eventName}`,
        text: [
          `Hello ${details.leadName},`,
          "",
          `Your free visit to ${details.eventName} is confirmed.`,
          `Date: ${eventDate}`,
          `Time: ${startTime}`,
          `Visitors: ${people}`,
          `Booking reference: ${details.referenceCode}`,
          "",
          "Your mobile ticket is attached to this email.",
          "Please open it full-screen and show its QR code to site control when you arrive.",
          "The railway is at Dringhouses, York, YO24 2JE.",
          "",
          "If your plans change, please contact secretary@yorkmodelengineers.co.uk.",
          "",
          "York City & District Society of Model Engineers",
        ].join("\n"),
        html: `<!doctype html><html><body style="margin:0;background:#eee9dc;color:#101814;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#18382d;color:#fff;padding:34px;border-top:6px solid #d5a84b"><p style="margin:0 0 12px;color:#d5a84b;font-size:12px;letter-spacing:2px;text-transform:uppercase">Booking confirmed</p><h1 style="margin:0;font-family:Georgia,serif;font-size:38px;font-weight:500">Your mobile ticket is ready.</h1></div><div style="background:#fffdf7;padding:34px"><p>Hello ${name},</p><p>Your free visit to <strong>${eventName}</strong> is confirmed. Save the ticket below to your phone and show it full-screen to site control.</p><img src="cid:${ticket.contentId}" width="540" alt="Mobile ticket for ${eventName}" style="display:block;width:100%;max-width:540px;height:auto;margin:26px auto;border:0"/><table role="presentation" style="width:100%;border-collapse:collapse;margin:26px 0"><tr><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;color:#5b645f">Date</td><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;text-align:right"><strong>${eventDate}</strong></td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;color:#5b645f">Time</td><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;text-align:right"><strong>${startTime}</strong></td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;color:#5b645f">Visitors</td><td style="padding:12px 0;border-bottom:1px solid #ddd5c6;text-align:right"><strong>${people}</strong></td></tr></table><div style="margin:28px 0;padding:22px;background:#f1eadb;text-align:center"><span style="display:block;margin-bottom:8px;color:#6a716d;font-size:11px;letter-spacing:1.5px;text-transform:uppercase">Booking reference</span><strong style="font-family:Georgia,serif;font-size:32px;letter-spacing:2px;color:#9a4431">${referenceCode}</strong></div><p>The railway is at <strong>Dringhouses, York, YO24 2JE</strong>.</p><p style="color:#5b645f;font-size:14px;line-height:1.6">If your plans change, please contact <a href="mailto:secretary@yorkmodelengineers.co.uk" style="color:#18382d">secretary@yorkmodelengineers.co.uk</a>.</p></div><p style="padding:18px;text-align:center;color:#68716c;font-size:12px">York City &amp; District Society of Model Engineers</p></div></body></html>`,
        attachments: [{
          content: ticket.buffer.toString("base64"),
          filename: ticket.filename,
          content_id: ticket.contentId,
          content_type: "image/png",
        }],
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      return { sent: false, error: body?.message || `Email provider returned ${response.status}.` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}
