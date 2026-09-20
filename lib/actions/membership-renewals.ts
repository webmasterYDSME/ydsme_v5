"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { membershipToken, membershipTokenHash, createMemberRenewalCheckout, ensureMembershipPlanPrice } from "@/lib/membership";
import { membershipBillingEnabled } from "@/lib/features";
import { writeAudit } from "@/lib/audit";

const RENEWALS = "/admin/memberships/renewals";

/**
 * Opens the year for renewals: makes sure every membership type has a fee and switches the year on so
 * members can renew from their account. It does not email anyone; sending the invitations is a separate step
 * (sendRenewalInvitations) so an officer can look first and try a test email on themselves.
 */
export async function openRenewalCampaign(form: FormData) {
  if (!membershipBillingEnabled()) redirect(`${RENEWALS}?error=renewals-unavailable`);
  const { user, role } = await requireCapability("memberships.manage");
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear()+1).parse(form.get("membership_year"));
  const admin = createServiceClient();
  const { data: plans, error: planError } = await admin.from("membership_plans").select("id").eq("active", true);
  if (planError) throw new Error("Unable to read membership fees.");
  for (const plan of plans ?? []) await ensureMembershipPlanPrice(plan.id, year);
  const { error } = await admin.from("membership_renewal_campaigns").upsert({ membership_year: year, open: true, opened_by: user.id }, { onConflict: "membership_year", ignoreDuplicates: true });
  if (error) throw new Error("Unable to open renewals.");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.renewals-opened",
    entityType: "membership-renewal-campaign", entityId: String(year), summary: `Renewals opened for ${year}`,
  });
  revalidatePath("/admin/memberships", "layout");
  redirect(`${RENEWALS}?year=${year}&notice=renewals-opened`);
}

/**
 * Queues the renewal invitation for every member who has not been invited yet. The emails are bulk mail: they
 * wait in the email queue and go out a few at a time, within the daily limit, so nothing is sent all at once.
 * Running it again only queues members who were missed.
 */
export async function sendRenewalInvitations(form: FormData) {
  if (!membershipBillingEnabled()) redirect(`${RENEWALS}?error=renewals-unavailable`);
  const { user, role } = await requireCapability("memberships.manage");
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear()+1).parse(form.get("membership_year"));
  const admin = createServiceClient();
  const { data: campaign } = await admin.from("membership_renewal_campaigns").select("open").eq("membership_year", year).maybeSingle();
  if (!campaign?.open) redirect(`${RENEWALS}?year=${year}&error=renewals-not-open`);
  let queued = 0;
  // Stable pages avoid silently dropping members beyond the API's row limit.
  let afterId: string | null = null;
  for (;;) {
    const query = admin.from("members").select("id,contact_email").in("effective_state", ["active", "grace", "lapsed"]);
    const { data: members, error: membersError } = await (afterId ? query.gt("id", afterId) : query).order("id").limit(200);
    if (membersError) throw new Error("Unable to prepare renewal invitations.");
    for (const member of members ?? []) {
      const token = membershipToken();
      const { data: created, error: queueError } = await admin.rpc("queue_membership_renewal_invitation", {
        p_member_id: member.id, p_year: year, p_actor: user.id, p_token: token, p_token_hash: membershipTokenHash(token),
      });
      if (queueError) throw new Error("Unable to queue renewals. Send the invitations again to continue safely.");
      if (created) queued += 1;
    }
    if (!members || members.length < 200) break;
    afterId = members[members.length - 1].id;
  }
  if (queued > 0) {
    await admin.rpc("request_membership_notification_delivery");
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membership.renewal-invitations-queued",
      entityType: "membership-renewal-campaign", entityId: String(year), summary: `${queued} renewal invitations queued for ${year}`,
    });
  }
  revalidatePath("/admin/memberships", "layout");
  redirect(`${RENEWALS}?year=${year}&notice=${queued > 0 ? "renewal-invitations-queued" : "renewal-invitations-none"}`);
}

/** Sends the officer a copy of a renewal invitation, addressed only to them, so they can see it before it goes to members. */
export async function sendRenewalTestEmail(form: FormData) {
  if (!membershipBillingEnabled()) redirect(`${RENEWALS}?error=renewals-unavailable`);
  const { user, role } = await requireCapability("memberships.manage");
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear()+1).parse(form.get("membership_year"));
  if (!user.email) redirect(`${RENEWALS}?year=${year}&error=renewal-test-failed`);
  const admin = createServiceClient();
  const { data: made, error } = await admin.rpc("queue_membership_renewal_test", { p_year: year, p_actor: user.id, p_recipient: user.email });
  if (error || !made) redirect(`${RENEWALS}?year=${year}&error=renewal-test-failed`);
  await admin.rpc("request_membership_notification_delivery");
  await writeAudit({
    actorUserId: user.id, actorRole: role, action: "membership.renewal-test-sent",
    entityType: "membership-renewal-campaign", entityId: String(year), summary: `Renewal test email sent to the officer for ${year}`,
  });
  redirect(`${RENEWALS}?year=${year}&notice=renewal-test-sent`);
}

/** Emails a reminder to invited members who have not paid. The database limits this to one reminder per member every seven days. */
export async function sendRenewalReminders(form: FormData) {
  if (!membershipBillingEnabled()) redirect(`${RENEWALS}?error=renewals-unavailable`);
  const { user, role } = await requireCapability("memberships.manage");
  const year = z.coerce.number().int().min(new Date().getUTCFullYear()).max(new Date().getUTCFullYear()+1).parse(form.get("membership_year"));
  const admin = createServiceClient();
  const { data: sent, error } = await admin.rpc("queue_membership_renewal_reminders", { p_year: year, p_actor: user.id });
  if (error) redirect(`${RENEWALS}?year=${year}&error=renewal-reminders-failed`);
  const count = Number(sent ?? 0);
  if (count > 0) {
    await admin.rpc("request_membership_notification_delivery");
    await writeAudit({
      actorUserId: user.id, actorRole: role, action: "membership.renewal-reminders-sent",
      entityType: "membership-renewal-campaign", entityId: String(year), summary: `${count} renewal reminders queued for ${year}`,
    });
  }
  revalidatePath("/admin/memberships", "layout");
  redirect(`${RENEWALS}?year=${year}&notice=${count > 0 ? "renewal-reminders-sent" : "renewal-reminders-none"}`);
}
export async function payRenewalInvitation(form: FormData) {
  if (!membershipBillingEnabled()) redirect("/membership");
  const token = z.string().min(20).max(200).parse(form.get("token"));
  const { data } = await createServiceClient().from("membership_renewal_invitations").select("member_id,membership_year")
    .eq("token_hash", membershipTokenHash(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) redirect("/membership");
  let url: string;
  try { url = await createMemberRenewalCheckout("", false, data.member_id, data.membership_year, `/membership/renew?token=${encodeURIComponent(token)}`); }
  catch { redirect(`/membership/renew?token=${token}&error=unavailable`); }
  redirect(url);
}
export async function reviewPaidMembership(form: FormData) {
  const { user } = await requireCapability("memberships.manage");
  const id = z.uuid().parse(form.get("application_id"));
  const decision = z.enum(["approved", "denied"]).parse(form.get("decision"));
  const reason = z.string().trim().min(5).max(500).parse(form.get("reason"));
  const { error } = await createServiceClient().rpc("review_paid_membership", { p_application_id: id, p_actor: user.id, p_decision: decision, p_reason: reason });
  if (error) throw new Error("Unable to record membership verification.");
  await createServiceClient().rpc("request_membership_notification_delivery");
  revalidatePath("/admin/memberships"); revalidatePath("/account");
  redirect("/admin/memberships?notice=verification-recorded");
}
