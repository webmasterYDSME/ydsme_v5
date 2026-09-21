"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadReadiness } from "@/lib/membership-mode";
import {
  DEFAULT_SWITCH_BACK_REASON, REASON_MAX, blockers, warnings, websiteConfirmationMatches,
} from "@/lib/membership-mode-format";

const PAGE = "/administrator/membership-mode";

/** Only administrators may change who runs membership. The layout checks too, but every action asks again. */
async function administrator() {
  const { user } = await requireRole(["administrator"]);
  return { user, admin: createServiceClient() };
}

function done(query: string): never {
  // Every page reads the setting fresh on each request, so there is nothing to revalidate.
  redirect(`${PAGE}?${query}`);
}

const reasonSchema = z.string().trim().max(REASON_MAX);

/**
 * Hands membership to the website. The word "website" must be typed, a reason is required, and the readiness checks
 * are run again here: a blocked check stops the switch, and a warning has to be accepted by ticking the box.
 */
export async function switchToWebsite(form: FormData) {
  const { user, admin } = await administrator();
  const typed = String(form.get("confirmation") ?? "");
  const reason = reasonSchema.safeParse(form.get("reason"));
  if (!reason.success || reason.data.length === 0) redirect(`${PAGE}?confirm=website&error=reason`);
  if (!websiteConfirmationMatches(typed)) redirect(`${PAGE}?confirm=website&error=confirmation`);

  const checks = await loadReadiness();
  if (blockers(checks).length > 0) redirect(`${PAGE}?error=blocked`);
  if (warnings(checks).length > 0 && form.get("accept_warnings") !== "on") redirect(`${PAGE}?confirm=website&error=warnings`);

  const { data, error } = await admin.rpc("set_membership_mode", {
    p_actor_id: user.id, p_mode: "website", p_reason: reason.data, p_checks: checks, p_stop_queued_emails: false,
  });
  if (error) redirect(`${PAGE}?error=failed`);
  done((data as { changed?: boolean } | null)?.changed === false ? "notice=unchanged" : "notice=website");
}

/**
 * Hands membership back to MemberMojo. This is the emergency brake, so it is one confirmation, no typing and no
 * checks. The reason is optional. Queued membership emails can be stopped in the same step.
 */
export async function switchToMemberMojo(form: FormData) {
  const { user, admin } = await administrator();
  const reason = reasonSchema.safeParse(form.get("reason"));
  if (!reason.success) redirect(`${PAGE}?error=reason`);
  const stop = form.get("stop_emails") === "on";

  const { data, error } = await admin.rpc("set_membership_mode", {
    p_actor_id: user.id, p_mode: "membermojo", p_reason: reason.data || DEFAULT_SWITCH_BACK_REASON, p_checks: null, p_stop_queued_emails: stop,
  });
  if (error) redirect(`${PAGE}?error=failed`);
  const result = data as { changed?: boolean; stopped_emails?: number } | null;
  if (result?.changed === false) done("notice=unchanged");
  done(`notice=membermojo&n=${Number(result?.stopped_emails ?? 0)}`);
}
