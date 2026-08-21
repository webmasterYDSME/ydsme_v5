import "server-only";

import { generateBookingTicket } from "./booking-ticket";
import { sendTransactionalEmail, type EmailDeliveryResult } from "./email-delivery";

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

type EmailResult = EmailDeliveryResult;

type BrandedEmailDetails = {
  preheader: string;
  eyebrow: string;
  headline: string;
  greeting: string;
  introduction: string;
  rows: Array<{ label: string; value: string }>;
  calloutLabel: string;
  callout: string;
  closing: string;
  accent: "brass" | "rust";
};

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

function renderBrandedEmail(details: BrandedEmailDetails) {
  const accent = details.accent === "rust" ? "#9a4431" : "#d5a84b";
  const accentWash = details.accent === "rust" ? "#f3e3dc" : "#f1eadb";
  const rows = details.rows.map(({ label, value }, index) => `
    <tr>
      <td style="padding:14px 0;${index < details.rows.length - 1 ? "border-bottom:1px solid #ddd5c6;" : ""}color:#68716c;font-size:13px;line-height:20px">${escapeHtml(label)}</td>
      <td style="padding:14px 0;${index < details.rows.length - 1 ? "border-bottom:1px solid #ddd5c6;" : ""}color:#13241d;font-size:14px;line-height:20px;text-align:right"><strong>${escapeHtml(value)}</strong></td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(details.headline)}</title>
  <style>@media only screen and (max-width:620px){.email-card{width:100%!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:34px!important;line-height:40px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#eee9dc;color:#13241d;font-family:Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(details.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eee9dc">
    <tr><td align="center" style="padding:36px 16px">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:620px;max-width:620px">
        <tr><td style="height:6px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="email-pad" style="padding:34px;background:#18382d;color:#ffffff">
          <p style="margin:0 0 12px;color:#d5a84b;font-size:12px;font-weight:700;letter-spacing:2px;line-height:18px;text-transform:uppercase">${escapeHtml(details.eyebrow)}</p>
          <h1 class="email-title" style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:38px;font-weight:500;line-height:44px">${escapeHtml(details.headline)}</h1>
        </td></tr>
        <tr><td class="email-pad" style="padding:34px;background:#fffdf7">
          <p style="margin:0 0 18px;color:#13241d;font-size:16px;line-height:26px">${escapeHtml(details.greeting)}</p>
          <p style="margin:0 0 26px;color:#39443e;font-size:16px;line-height:26px">${escapeHtml(details.introduction)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #ddd5c6;border-bottom:1px solid #ddd5c6">${rows}
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:28px 0">
            <tr><td style="padding:22px;background:${accentWash};border-left:4px solid ${accent}">
              <span style="display:block;margin:0 0 8px;color:#68716c;font-size:10px;font-weight:700;letter-spacing:1.5px;line-height:15px;text-transform:uppercase">${escapeHtml(details.calloutLabel)}</span>
              <strong style="display:block;color:#13241d;font-family:Georgia,serif;font-size:22px;font-weight:500;line-height:30px">${escapeHtml(details.callout)}</strong>
            </td></tr>
          </table>
          <p style="margin:0;color:#5b645f;font-size:14px;line-height:23px">${escapeHtml(details.closing)} <a href="mailto:secretary@yorkmodelengineers.co.uk" style="color:#18382d;font-weight:700">Contact the Society</a>.</p>
        </td></tr>
        <tr><td style="padding:18px;text-align:center;color:#68716c;font-size:12px;line-height:18px">York City &amp; District Society of Model Engineers</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderBookingCancellationEmail(details: BookingEmailDetails, reason?: string) {
  const eventDate = readableDate(details.eventDate);
  const safeReason = reason?.trim().slice(0, 500);

  return {
    subject: `Booking cancelled: ${details.eventName}`,
    text: [
      `Hello ${details.leadName},`,
      "",
      `Your booking for ${details.eventName} on ${eventDate} has been cancelled.`,
      `Booking reference: ${details.referenceCode}`,
      safeReason ? `Reason: ${safeReason}` : "",
      "",
      "If you believe this is a mistake, please contact the Society.",
      "",
      "York City & District Society of Model Engineers",
    ].filter(Boolean).join("\n"),
    html: renderBrandedEmail({
      preheader: `Your booking for ${details.eventName} has been cancelled.`,
      eyebrow: "Booking update",
      headline: "Your booking has been cancelled.",
      greeting: `Hello ${details.leadName},`,
      introduction: `Your booking for ${details.eventName} is no longer active. We have released the places held for your visit.`,
      rows: [
        { label: "Event", value: details.eventName },
        { label: "Date", value: eventDate },
        { label: "Booking reference", value: details.referenceCode },
      ],
      calloutLabel: safeReason ? "Cancellation reason" : "Booking status",
      callout: safeReason || "Cancelled",
      closing: "If you believe this is a mistake or would like any help,",
      accent: "rust",
    }),
  };
}

export function renderWorkshopReservationUpdateEmail(details: {
  memberName: string;
  workshopTitle: string;
  workshopDate: string;
  reserved: boolean;
}) {
  const workshopDate = readableDate(details.workshopDate);
  const state = details.reserved ? "reserved" : "cancelled";

  return {
    subject: `Workshop place ${state}: ${details.workshopTitle}`,
    text: [
      `Hello ${details.memberName},`,
      "",
      `Your place at ${details.workshopTitle} on ${workshopDate} has been ${state}.`,
      "",
      details.reserved ? "You are on the list. We look forward to seeing you." : "Your place has been released and is now available to another member.",
      "",
      "York City & District Society of Model Engineers",
    ].join("\n"),
    html: renderBrandedEmail({
      preheader: `Your workshop place has been ${state}.`,
      eyebrow: details.reserved ? "Workshop place reserved" : "Workshop place cancelled",
      headline: details.reserved ? "Your place is saved." : "Your place has been released.",
      greeting: `Hello ${details.memberName},`,
      introduction: details.reserved
        ? `We have reserved your place at ${details.workshopTitle}. We are delighted you will be joining us.`
        : `Your reservation for ${details.workshopTitle} has been cancelled and your place is now available to another member.`,
      rows: [
        { label: "Workshop", value: details.workshopTitle },
        { label: "Date", value: workshopDate },
        { label: "Status", value: details.reserved ? "Place reserved" : "Place cancelled" },
      ],
      calloutLabel: details.reserved ? "You’re on the list" : "Reservation update",
      callout: details.reserved ? "We look forward to seeing you." : "There is nothing else you need to do.",
      closing: details.reserved ? "If your plans change or you have any questions," : "If you cancelled by mistake or would like any help,",
      accent: details.reserved ? "brass" : "rust",
    }),
  };
}

export async function sendBookingConfirmation(
  details: BookingEmailDetails,
  options: { resend?: boolean } = {},
): Promise<EmailResult> {
  const from = process.env.BOOKINGS_FROM_EMAIL;
  if (!from) {
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
    return sendTransactionalEmail({
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
      }, idempotencyKey);
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

export async function sendBookingCancellation(
  details: BookingEmailDetails,
  reason?: string,
): Promise<EmailResult> {
  const from = process.env.BOOKINGS_FROM_EMAIL;
  if (!from) return { sent: false, error: "Booking email is not configured." };

  const replyTo = process.env.BOOKINGS_REPLY_TO;
  const email = renderBookingCancellationEmail(details, reason);
  try {
    return sendTransactionalEmail({
        from,
        to: [details.email],
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...email,
      }, `booking-${details.bookingId}-cancellation`);
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Email delivery failed." };
  }
}

export async function sendWorkshopReservationUpdate(details: {
  email: string;
  memberName: string;
  workshopTitle: string;
  workshopDate: string;
  reserved: boolean;
}): Promise<EmailResult> {
  const from = process.env.WORKSHOPS_FROM_EMAIL || process.env.BOOKINGS_FROM_EMAIL;
  if (!from) return { sent: false, error: "Workshop email is not configured." };
  const email = renderWorkshopReservationUpdateEmail(details);
  try {
    return sendTransactionalEmail({
        from,
        to: [details.email],
        ...(process.env.BOOKINGS_REPLY_TO ? { reply_to: process.env.BOOKINGS_REPLY_TO } : {}),
        ...email,
      });
  } catch {
    return { sent: false, error: "Email delivery failed." };
  }
}
