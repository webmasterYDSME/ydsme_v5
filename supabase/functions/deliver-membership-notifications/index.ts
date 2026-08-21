import { withSupabase } from "@supabase/server";

type ClaimedNotification = {
  notification_id: string;
  member_id: string | null;
  recipient_email: string;
  title: string;
  body: string;
  kind: string;
  action_href: string | null;
  email_attempts: number;
};

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
    if (membershipMode !== "pilot" && membershipMode !== "live") {
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

    const { data, error } = await context.supabaseAdmin.rpc("claim_membership_notifications", { p_limit: 25 });
    if (error) {
      console.error("Unable to claim membership notifications", error.message);
      return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    let sent = 0;
    let failed = 0;
    for (const notification of (data ?? []) as ClaimedNotification[]) {
      const actionUrl = notification.action_href ? `${siteUrl}${notification.action_href}` : null;
      let deliveryError: string | null = null;
      let providerMessageId: string | null = null;
      try {
        const textBody = [notification.body, actionUrl ? `Open: ${actionUrl}` : "", "", "York City & District Society of Model Engineers"].filter(Boolean).join("\n\n");
        const htmlBody = `<!doctype html><html><body style="margin:0;background:#eee9dc;color:#13241d;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#18382d;color:#fff;padding:34px;border-top:6px solid #d5a84b"><p style="margin:0 0 12px;color:#d5a84b;font-size:12px;letter-spacing:2px;text-transform:uppercase">Membership update</p><h1 style="margin:0;font-family:Georgia,serif;font-size:36px;font-weight:500">${escapeHtml(notification.title)}</h1></div><div style="background:#fffdf7;padding:34px"><p style="margin:0;color:#39443e;font-size:16px;line-height:26px">${escapeHtml(notification.body)}</p>${actionUrl ? `<p style="margin:28px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#18382d;color:#fff;padding:13px 18px;text-decoration:none;font-weight:700">Open membership account</a></p>` : ""}</div><p style="padding:18px;text-align:center;color:#68716c;font-size:12px">York City &amp; District Society of Model Engineers</p></div></body></html>`;
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

    return Response.json(
      { ok: failed === 0, result: { claimed: (data ?? []).length, sent, failed } },
      { status: failed === 0 ? 200 : 207, headers: { "Cache-Control": "no-store" } },
    );
  }),
};
