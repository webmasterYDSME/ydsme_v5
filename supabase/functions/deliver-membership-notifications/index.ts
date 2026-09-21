import { withSupabase } from "@supabase/server";
import { renewalHtml, renewalText } from "./renewal-email.ts";

type ClaimedNotification = {
  notification_id: string;
  member_id: string | null;
  recipient_email: string;
  title: string;
  body: string;
  kind: string;
  action_href: string | null;
  email_attempts: number;
  delivery_class: "immediate" | "bulk";
};

// The provider sends 429 for two different reasons: we are going too fast (wait a minute) or the
// day's allowance is spent (wait an hour before asking again). Neither counts as a failed attempt.
const PROVIDER_SPACING_MS = 600;
const CLAIM_SIZE = 25;
const MAX_ROUNDS = 3;

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const loopbackSiteUrl = (value: string) => /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(value);
const localSupabaseUrl = (value: string) => /^http:\/\/(?:kong|127\.0\.0\.1|localhost)(?::\d+)?$/i.test(value);
const localMailpitUrl = (value: string) => /^http:\/\/(?:inbucket|127\.0\.0\.1|localhost)(?::\d+)?$/i.test(value);

const mailbox = (value: string) => {
  const named = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  return named
    ? { Email: named[2].trim(), ...(named[1].trim() ? { Name: named[1].trim() } : {}) }
    : { Email: value.trim() };
};

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") {
      return Response.json({ ok: false }, { status: 405, headers: { Allow: "POST" } });
    }

    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
    const isLocalSupabase = localSupabaseUrl(supabaseUrl);
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("MEMBERSHIP_FROM_EMAIL")
      || (isLocalSupabase ? "York Model Engineers <membership@example.com>" : "");
    const replyTo = Deno.env.get("MEMBERSHIP_REPLY_TO");
    const siteUrl = (Deno.env.get("SITE_URL") || (isLocalSupabase ? "http://localhost:3010" : "")).replace(/\/$/, "");
    const mailpitUrl = (Deno.env.get("LOCAL_MAILPIT_URL") || (isLocalSupabase ? "http://inbucket:8025" : "")).replace(/\/$/, "");
    const membershipMode = (Deno.env.get("MEMBERSHIP_MODE") || "membermojo").toLowerCase();
    if (!["website", "pilot", "live", "drain"].includes(membershipMode)) {
      return Response.json({ ok: true, result: { claimed: 0, sent: 0, failed: 0, paused: true } }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const useLocalMailpit = loopbackSiteUrl(siteUrl)
      && isLocalSupabase
      && localMailpitUrl(mailpitUrl);
    if (!from || !siteUrl || (!useLocalMailpit && !apiKey)) {
      console.error("Membership notification delivery is not configured.");
      return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let claimedTotal = 0;
    let stopped = false;
    const defer = async (id: string, seconds: number, reason: string) => {
      const { error: deferError } = await context.supabaseAdmin.rpc("defer_membership_notification", {
        p_id: id,
        p_seconds: seconds,
        p_reason: reason,
      });
      if (deferError) console.error("Unable to defer membership notification", deferError.message);
      deferred += 1;
    };
    // Several rounds, so mail added in a burst is not left waiting for the next minute's job.
    for (let round = 0; round < MAX_ROUNDS && !stopped; round += 1) {
    const { data, error } = await context.supabaseAdmin.rpc("claim_membership_notifications", { p_limit: CLAIM_SIZE });
    if (error) {
      console.error("Unable to claim membership notifications", error.message);
      if (round === 0) return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
      break;
    }
    const claimed = (data ?? []) as ClaimedNotification[];
    claimedTotal += claimed.length;
    for (const [index, notification] of claimed.entries()) {
      if (stopped) {
        // The provider asked us to stop, so hand back everything we have not sent yet.
        await defer(notification.notification_id, 60, "Waiting for the email provider.");
        continue;
      }
      if (index > 0 && !useLocalMailpit) await new Promise((resolve) => setTimeout(resolve, PROVIDER_SPACING_MS));
      const actionUrl = notification.action_href ? `${siteUrl}${notification.action_href}` : null;
      // Renewal emails point at the renewal page, not the member account, so they say so.
      const isRenewal = notification.kind === "membership.renewal-invitation" || notification.kind === "membership.renewal-reminder";
      const eyebrow = isRenewal ? "Membership renewal" : "Membership update";
      const buttonLabel = isRenewal ? "Renew my membership" : "Open membership account";
      const textLinkLabel = isRenewal ? "Renew online" : "Open";
      let deliveryError: string | null = null;
      let providerMessageId: string | null = null;
      try {
        // Renewal emails written in the newer layout list each way to pay as its own block, with the
        // renewal button in the card block. Older ones (and every other notice) keep the simple layout.
        const renewalLayout = isRenewal
          ? renewalHtml({ eyebrow, title: notification.title, body: notification.body, actionUrl, buttonLabel })
          : null;
        const textBody = renewalLayout
          ? [renewalText(notification.body, actionUrl, textLinkLabel), "York City & District Society of Model Engineers"].join("\n\n")
          : [notification.body, actionUrl ? `${textLinkLabel}: ${actionUrl}` : "", "", "York City & District Society of Model Engineers"].filter(Boolean).join("\n\n");
        const htmlBody = renewalLayout ?? `<!doctype html><html><body style="margin:0;background:#eee9dc;color:#13241d;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#18382d;color:#fff;padding:34px;border-top:6px solid #d5a84b"><p style="margin:0 0 12px;color:#d5a84b;font-size:12px;letter-spacing:2px;text-transform:uppercase">${escapeHtml(eyebrow)}</p><h1 style="margin:0;font-family:Georgia,serif;font-size:36px;font-weight:500">${escapeHtml(notification.title)}</h1></div><div style="background:#fffdf7;padding:34px"><p style="margin:0;color:#39443e;font-size:16px;line-height:26px;white-space:pre-line">${escapeHtml(notification.body)}</p>${actionUrl ? `<p style="margin:28px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#18382d;color:#fff;padding:13px 18px;text-decoration:none;font-weight:700">${escapeHtml(buttonLabel)}</a></p>` : ""}</div><p style="padding:18px;text-align:center;color:#68716c;font-size:12px">York City &amp; District Society of Model Engineers</p></div></body></html>`;
        const response = useLocalMailpit
          ? await fetch(`${mailpitUrl}/api/v1/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              From: mailbox(from),
              To: [mailbox(notification.recipient_email)],
              ...(replyTo ? { ReplyTo: [mailbox(replyTo)] } : {}),
              Subject: notification.title,
              Text: textBody,
              HTML: htmlBody,
              Tags: ["local-development", "membership"],
            }),
          })
          : await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `membership-${notification.notification_id}`,
            },
            body: JSON.stringify({
              from,
              to: [notification.recipient_email],
              ...(replyTo ? { reply_to: replyTo } : {}),
              subject: notification.title,
              text: textBody,
              html: htmlBody,
            }),
          });
        if (response.status === 429 && !useLocalMailpit) {
          const body = await response.json().catch(() => null) as { name?: string } | null;
          const quota = body?.name === "daily_quota_exceeded" || body?.name === "monthly_quota_exceeded";
          if (quota) {
            await context.supabaseAdmin.rpc("pause_email_provider", {
              p_seconds: 3600,
              p_reason: "The email provider says the sending allowance has been used up.",
            });
          }
          await defer(
            notification.notification_id,
            quota ? 3600 : Math.max(60, Number(response.headers.get("retry-after")) || 60),
            quota ? "Email provider allowance used up." : "Email provider is busy.",
          );
          stopped = true;
          continue;
        }
        if (!response.ok) {
          deliveryError = `Email provider returned ${response.status}.`;
        } else if (!useLocalMailpit) {
          const result = await response.json().catch(() => null) as { id?: string } | null;
          providerMessageId = result?.id ?? null;
        }
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : "Email delivery failed.";
      }

      const { error: completionError } = await context.supabaseAdmin.rpc("complete_membership_notification", {
        p_notification_id: notification.notification_id,
        p_sent: deliveryError === null,
        p_error: deliveryError,
        p_provider_message_id: providerMessageId,
      });
      if (completionError) console.error("Unable to complete membership notification", completionError.message);
      if (deliveryError) failed += 1;
      else sent += 1;
    }

    if (claimed.length < CLAIM_SIZE) break;
    }

    return Response.json(
      { ok: failed === 0, result: { claimed: claimedTotal, sent, failed, deferred } },
      { status: failed === 0 ? 200 : 207, headers: { "Cache-Control": "no-store" } },
    );
  }),
};
