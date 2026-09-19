import { withSupabase } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProviderCommand = {
  command_id: string;
  command_type: string;
  stripe_subscription_id: string;
  payload: Record<string, unknown> | null;
  idempotency_key: string;
};

async function stripeRequest(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Payment service returned ${response.status}.`);
  return await response.json() as Record<string, unknown>;
}

const INVITATIONS_PER_RUN = 10;

/**
 * Website invitations for people added by the MemberMojo list import. Runs every five minutes while an
 * administrator has started the run. It works in every membership mode. Supabase Auth creates the login and
 * sends the secure link, so this cannot use the email queue, and it must stay under Supabase Auth's hourly
 * email limit: when that limit is reached the run waits 15 minutes and carries on by itself.
 */
async function sendMemberInvitationBatch(admin: SupabaseClient) {
  const { data: claimed, error: claimError } = await admin.rpc("claim_member_invitation_run");
  if (claimError) return Response.json({ ok: false }, { status: 500 });
  if (!claimed) return Response.json({ ok: true, idle: true });

  const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric" }).format(new Date());
  let rateLimited = false;
  let lastError: string | null = null;
  let sent = 0;
  let linked = 0;
  let failed = 0;
  try {
    if (!siteUrl) throw new Error("The website address is not configured.");
    const { data: people, error: listError } = await admin.rpc("next_member_invitations", { p_limit: INVITATIONS_PER_RUN });
    if (listError) throw new Error("The list of people to invite could not be read.");
    for (const person of (people ?? []) as Array<{ id: string; full_name: string; contact_email: string }>) {
      const email = String(person.contact_email).trim().toLowerCase();
      const record = (outcome: string, authUserId: string | null, error: string | null) =>
        admin.rpc("record_member_invitation", {
          p_member_id: person.id, p_outcome: outcome, p_auth_user_id: authUserId, p_error: error,
        });
      const { data: profiles, error: profileError } = await admin.from("users").select("id")
        .ilike("email", email.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")).limit(2);
      if (profileError) { await record("failed", null, "The existing logins could not be checked."); failed += 1; continue; }
      if (profiles && profiles.length > 0) {
        // Someone with this email already has a login. Link it unless it already belongs to another member.
        if (profiles.length > 1) { await record("blocked_shared", null, null); continue; }
        const { data: owner } = await admin.from("members").select("id").eq("auth_user_id", profiles[0].id).neq("id", person.id).maybeSingle();
        if (owner) await record("blocked_shared", null, null);
        else { await record("linked", profiles[0].id as string, null); linked += 1; }
        continue;
      }
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: person.full_name, membership_active: true, invite_context: "membermojo", membership_year: year },
        redirectTo: `${siteUrl}/auth/invite?next=/account`,
      });
      if (inviteError || !invitation.user) {
        const code = (inviteError as { code?: string } | null)?.code ?? "";
        if (inviteError?.status === 429 || code.includes("rate_limit")) { rateLimited = true; break; }
        await record("failed", null, "The invitation could not be sent.");
        failed += 1;
        continue;
      }
      await record("sent", invitation.user.id, null);
      sent += 1;
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "The invitations could not be sent.";
  }
  const { data: status } = await admin.rpc("finish_member_invitation_run", { p_rate_limited: rateLimited, p_error: lastError });
  return Response.json({ ok: !lastError, sent, linked, failed, rateLimited, status }, { status: lastError ? 500 : 200 });
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    // "website" (or the older pilot, live, drain) means the website runs membership. Anything else means
    // MemberMojo still does: the daily lifecycle keeps access in step with the imported list, but nothing
    // is charged and no member is emailed by the website.
    const configured = (Deno.env.get("MEMBERSHIP_MODE") || "membermojo").toLowerCase();
    const membermojoMode = !["website", "pilot", "live", "drain"].includes(configured);
    const body = await request.json().catch(() => ({})) as { job?: string };
    if (body.job === "invitations") return await sendMemberInvitationBatch(context.supabaseAdmin);
    if (membermojoMode && body.job === "commands") return Response.json({ ok: true, paused: true });

    if (body.job === "commands") {
      const apiKey = Deno.env.get("STRIPE_RESTRICTED_KEY") || Deno.env.get("STRIPE_SECRET_KEY");
      if (!apiKey) return Response.json({ ok: false, error: "Payment service is not configured." }, { status: 503 });
      const { data, error } = await context.supabaseAdmin.rpc("claim_membership_provider_commands", {
        p_member_id: null, p_limit: 20,
      });
      if (error) return Response.json({ ok: false }, { status: 500 });
      let completed = 0;
      let failed = 0;
      for (const command of (data ?? []) as ProviderCommand[]) {
        try {
          const params = new URLSearchParams();
          if (command.command_type === "transition_price") {
            const priceId = typeof command.payload?.stripe_price_id === "string" ? command.payload.stripe_price_id : null;
            if (!priceId) throw new Error("Price transition is incomplete.");
            const subscription = await stripeRequest(`/subscriptions/${encodeURIComponent(command.stripe_subscription_id)}`, apiKey);
            const items = (subscription.items as { data?: Array<{ id: string; price?: { recurring?: unknown } }> } | undefined)?.data ?? [];
            const item = items.find((candidate) => candidate.price?.recurring)?.id;
            if (!item) throw new Error("Recurring membership item is unavailable.");
            params.set("items[0][id]", item);
            params.set("items[0][price]", priceId);
            params.set("proration_behavior", "none");
          } else {
            params.set("cancel_at_period_end", command.command_type === "resume_auto_renew" ? "false" : "true");
          }
          await stripeRequest(`/subscriptions/${encodeURIComponent(command.stripe_subscription_id)}`, apiKey, {
            method: "POST", body: params,
            headers: { "Idempotency-Key": command.idempotency_key },
          });
          await context.supabaseAdmin.rpc("complete_membership_provider_command", {
            p_command_id: command.command_id, p_succeeded: true, p_safe_error: null,
          });
          completed += 1;
        } catch {
          await context.supabaseAdmin.rpc("complete_membership_provider_command", {
            p_command_id: command.command_id, p_succeeded: false,
            p_safe_error: "The payment service update failed and will be retried.",
          });
          failed += 1;
        }
      }
      return Response.json({ ok: failed === 0, claimed: (data ?? []).length, completed, failed }, { status: failed ? 207 : 200 });
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    await context.supabaseAdmin.rpc("run_membership_launch_retention", { p_today: today });
    if (membermojoMode) {
      const { data: caughtUp, error: caughtUpError } = await context.supabaseAdmin.rpc("run_membership_daily_catch_up", { p_today: today });
      if (caughtUpError) return Response.json({ ok: false }, { status: 500 });
      // MemberMojo sends the members' emails, so the website's own member-facing ones are dropped, not queued for later.
      await context.supabaseAdmin.rpc("discard_unsent_member_emails");
      return Response.json({ ok: true, result: caughtUp, membermojo: true });
    }
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    await context.supabaseAdmin.rpc("expire_membership_applications");
    await context.supabaseAdmin.rpc("roll_forward_membership_plan_prices", {
      p_membership_year: month === 12 ? year + 1 : year,
    });
    if (month === 11) await context.supabaseAdmin.rpc("prepare_membership_age_transitions", { p_membership_year: year + 1 });
    await context.supabaseAdmin.rpc("apply_membership_plan_transitions", { p_today: today });
    const { data, error } = await context.supabaseAdmin.rpc("run_membership_daily_catch_up", { p_today: today });
    if (error) return Response.json({ ok: false }, { status: 500 });
    const { data: honoraryMembers, error: honoraryError } = await context.supabaseAdmin.from("members")
      .select("id,full_name,contact_email")
      .eq("effective_state", "honorary")
      .eq("contact_role", "self")
      .eq("portal_invitation_status", "eligible")
      .is("auth_user_id", null)
      .not("contact_email", "is", null)
      .limit(100);
    if (honoraryError) return Response.json({ ok: false }, { status: 500 });
    const siteUrl = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
    for (const member of honoraryMembers ?? []) {
      const { data: existing } = await context.supabaseAdmin.from("users")
        .select("id").ilike("email", member.contact_email.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")).limit(1).maybeSingle();
      if (existing) {
        await context.supabaseAdmin.from("members").update({ portal_invitation_status: "blocked_shared" }).eq("id", member.id);
        continue;
      }
      const { data: invitation, error: invitationError } = await context.supabaseAdmin.auth.admin.inviteUserByEmail(
        member.contact_email,
        {
          data: { full_name: member.full_name, membership_active: true },
          redirectTo: `${siteUrl}/auth/invite?next=/account`,
        },
      );
      if (invitationError || !invitation.user) continue;
      const { data: linked } = await context.supabaseAdmin.from("members").update({
        auth_user_id: invitation.user.id,
        portal_invitation_status: "sent",
        updated_at: new Date().toISOString(),
      }).eq("id", member.id).is("auth_user_id", null).select("id").maybeSingle();
      if (!linked) continue;
      await context.supabaseAdmin.from("membership_notifications").update({
        recipient_user_id: invitation.user.id,
        portal_visible: true,
        email_status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("member_id", member.id).eq("kind", "membership.honorary-activated");
    }
    return Response.json({ ok: true, result: data });
  }),
};
