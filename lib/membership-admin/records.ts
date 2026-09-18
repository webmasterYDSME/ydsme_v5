import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildRenewalChoices, renewableMembers, type RenewalMember } from "@/lib/membership-rules";
import { money } from "@/lib/membership-admin/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function fail(what: string, error: unknown): never {
  if (error) console.error(`Membership administration: ${what}`, error);
  throw new Error(`Unable to load ${what}.`);
}

export const countMigrationReviews = cache(async () => {
  const { count, error } = await createServiceClient().from("membership_migration_reviews")
    .select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error) fail("membership migration reviews", error);
  return count ?? 0;
});

export async function loadPlansAndPrices() {
  const admin = createServiceClient();
  const [plans, prices] = await Promise.all([
    admin.from("membership_plans").select("id,slug,name,description,minimum_age,maximum_age,requires_approval,active,stripe_product_id").order("sort_order"),
    admin.from("membership_plan_prices").select("id,plan_id,membership_year,amount_pence,stripe_price_id,active,version,carried_forward_from_id").eq("active", true).order("membership_year", { ascending: false }),
  ]);
  if (plans.error || prices.error) fail("membership types and fees", plans.error ?? prices.error);
  return { plans: (plans.data ?? []) as Row[], prices: (prices.data ?? []) as Row[] };
}

/** The member register: one line per person, with plan and the date their paid membership runs to. */
export async function loadMemberRegister() {
  const admin = createServiceClient();
  const [members, terms, plans] = await Promise.all([
    admin.from("members").select("id,full_name,contact_email,effective_state,current_plan_id").neq("effective_state", "archived").order("full_name"),
    admin.from("membership_terms").select("member_id,ends_on").eq("status", "paid"),
    admin.from("membership_plans").select("id,name"),
  ]);
  if (members.error || terms.error || plans.error) fail("the member register", members.error ?? terms.error ?? plans.error);
  const planName = new Map(((plans.data ?? []) as Row[]).map((plan) => [plan.id, plan.name as string]));
  const paidUntil = new Map<string, string>();
  for (const term of (terms.data ?? []) as Row[]) {
    if (!paidUntil.has(term.member_id) || term.ends_on > paidUntil.get(term.member_id)!) paidUntil.set(term.member_id, term.ends_on);
  }
  return ((members.data ?? []) as Row[]).map((member) => ({
    id: member.id as string,
    fullName: member.full_name as string,
    email: (member.contact_email as string | null) ?? null,
    state: member.effective_state as string,
    plan: (member.current_plan_id ? planName.get(member.current_plan_id) : null) ?? null,
    paidUntil: paidUntil.get(member.id) ?? null,
  }));
}

export type RegisterMember = Awaited<ReturnType<typeof loadMemberRegister>>[number];

/** Everything shown on one member's page, or null when there is no such member. */
export async function loadMemberRecord(memberId: string) {
  const admin = createServiceClient();
  const currentYear = new Date().getUTCFullYear();
  const [memberResult, termResult, honoraryResult, planResult, priceResult, transitionResult] = await Promise.all([
    admin.from("members").select("id,full_name,contact_email,contact_email_verified_at,contact_role,contact_number,date_of_birth,effective_state,current_plan_id,auth_user_id,portal_invitation_status,honorary_memberships(status,effective_from,revoked_effective_on,replacement_plan_id)").eq("id", memberId).maybeSingle(),
    admin.from("membership_terms").select("id,membership_year,status,amount_due_pence,amount_paid_pence,source,starts_on,ends_on").eq("member_id", memberId).order("membership_year", { ascending: false }),
    admin.from("honorary_memberships").select("id,status,effective_from,reason,granted_at,revoked_effective_on,revocation_reason").eq("member_id", memberId).order("granted_at", { ascending: false }),
    admin.from("membership_plans").select("id,name").order("sort_order"),
    admin.from("membership_plan_prices").select("plan_id,membership_year,amount_pence").eq("active", true).order("membership_year", { ascending: false }),
    admin.from("membership_plan_transitions").select("member_id,membership_year,status,to_plan_id")
      .eq("member_id", memberId).in("status", ["scheduled", "approved", "awaiting_student_review"])
      .gte("membership_year", currentYear).lte("membership_year", currentYear + 1),
  ]);
  for (const result of [memberResult, termResult, honoraryResult, planResult, priceResult, transitionResult]) {
    if (result.error) fail("the membership record", result.error);
  }
  const member = memberResult.data as Row | null;
  if (!member) return null;
  const terms = (termResult.data ?? []) as Row[];
  const paymentResult = terms.length
    ? await admin.from("membership_payments").select("id,term_id,method,status,amount_pence,refunded_pence,cash_receipt_reference,offline_reference,received_at,cleared_at,created_at,recorded_by_actor_id,administrative_actors(reference_code,display_name,status)")
      .in("term_id", terms.map((term) => term.id)).order("created_at", { ascending: false })
    : { data: [] as Row[], error: null };
  if (paymentResult.error) fail("the payment history", paymentResult.error);
  const plans = (planResult.data ?? []) as Row[];
  const choices = buildRenewalChoices({
    members: [member as RenewalMember],
    prices: (priceResult.data ?? []) as Row[],
    transitions: (transitionResult.data ?? []) as Row[],
    terms: terms.map((term) => ({ ...term, member_id: memberId })),
    currentYear,
    formatMoney: money,
  });
  return {
    member,
    plan: plans.find((plan) => plan.id === member.current_plan_id) ?? null,
    plans,
    terms,
    honorary: (honoraryResult.data ?? []) as Row[],
    payments: (paymentResult.data ?? []) as Row[],
    renewable: renewableMembers([member as RenewalMember]).length > 0,
    choices,
    currentYear,
  };
}

/** Members and amounts for the officer-recorded renewal form. */
export async function loadRenewalWorkspace() {
  const admin = createServiceClient();
  const currentYear = new Date().getUTCFullYear();
  const [members, prices, transitions, terms, plans] = await Promise.all([
    admin.from("members").select("id,full_name,current_plan_id,effective_state,honorary_memberships(status,effective_from,revoked_effective_on,replacement_plan_id)").neq("effective_state", "archived").order("full_name"),
    admin.from("membership_plan_prices").select("plan_id,membership_year,amount_pence").eq("active", true).order("membership_year", { ascending: false }),
    admin.from("membership_plan_transitions").select("member_id,membership_year,status,to_plan_id")
      .in("status", ["scheduled", "approved", "awaiting_student_review"]).gte("membership_year", currentYear).lte("membership_year", currentYear + 1),
    admin.from("membership_terms").select("member_id,membership_year,status,amount_due_pence,amount_paid_pence,source").gte("membership_year", currentYear).lte("membership_year", currentYear + 1),
    admin.from("membership_plans").select("id,name,membership_plan_prices(membership_year,amount_pence,version,active)").eq("active", true).order("sort_order"),
  ]);
  for (const result of [members, prices, transitions, terms, plans]) if (result.error) fail("renewals", result.error);
  const memberRows = (members.data ?? []) as Row[];
  return {
    currentYear,
    plans: (plans.data ?? []) as Row[],
    renewable: renewableMembers(memberRows as RenewalMember[]) as Row[],
    choices: buildRenewalChoices({
      members: memberRows as RenewalMember[], prices: (prices.data ?? []) as Row[], transitions: (transitions.data ?? []) as Row[],
      terms: (terms.data ?? []) as Row[], currentYear, formatMoney: money,
    }),
  };
}

export async function loadReportExports() {
  const { data, error } = await createServiceClient().from("membership_report_exports")
    .select("id,status,storage_path,row_counts,financial_totals,created_at,completed_at,expires_at,last_error")
    .order("created_at", { ascending: false }).limit(10);
  if (error) fail("membership reports", error);
  return (data ?? []) as Row[];
}

export async function loadMigrationReviews() {
  const { data, error } = await createServiceClient().from("membership_migration_reviews")
    .select("id,review_kind,summary,status,membership_record_id").eq("status", "pending").order("created_at").limit(100);
  if (error) fail("imported records", error);
  return (data ?? []) as Row[];
}
