const londonFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" });

/**
 * The calendar date in London at that moment. The database prices and ages people by the London date, so
 * the website has to as well, otherwise the two disagree for the hour after midnight while British Summer
 * Time is in force and a payment is refused for having "the wrong amount".
 */
export function londonDateParts(onDate: Date) {
  const parts = Object.fromEntries(londonFormat.formatToParts(onDate).map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function ageOn(dateOfBirth: string, onDate = new Date()) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const today = londonDateParts(onDate);
  let age = today.year - year;
  const beforeBirthday = today.month < month
    || (today.month === month && today.day < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export type MembershipEligibilityPlan = {
  id: string;
  slug: string;
  minimum_age: number;
  maximum_age: number;
};

export function eligibleMembershipPlans<T extends MembershipEligibilityPlan>(
  plans: T[],
  dateOfBirth: string,
  onDate = new Date(),
) {
  const age = ageOn(dateOfBirth, onDate);
  return {
    age,
    plans: plans.filter((plan) => age >= plan.minimum_age && age <= plan.maximum_age),
  };
}

export function defaultMembershipPlan<T extends MembershipEligibilityPlan>(plans: T[]) {
  return plans.find((plan) => plan.slug === "adult")
    ?? plans.find((plan) => plan.slug !== "student")
    ?? null;
}

export function membershipBillingYear(onDate = new Date()) {
  const { year, month } = londonDateParts(onDate);
  return year + (month === 12 ? 1 : 0);
}

export function membershipRenewalYear(onDate = new Date()) {
  const { year, month } = londonDateParts(onDate);
  return year + (month >= 11 ? 1 : 0);
}

export function membershipRenewalIsOpen(onDate = new Date()) {
  const { month } = londonDateParts(onDate);
  return month >= 11 || month <= 3;
}

export function proratedMembershipFee(annualPence: number, onDate = new Date()) {
  const { month } = londonDateParts(onDate);
  return month === 12 ? annualPence : Math.round(annualPence * (13 - month) / 12);
}

export function membershipRenewalAt(membershipYear: number) {
  return new Date(Date.UTC(membershipYear + 1, 0, 1, 0, 0, 0));
}

export type RenewalMember = {
  id: string;
  current_plan_id: string | null;
  effective_state: string;
  /** Lets the fee follow an age change before the change has been recorded. */
  date_of_birth?: string | null;
  honorary_memberships: Array<{ status: string; effective_from: string; revoked_effective_on: string | null; replacement_plan_id: string | null }> | null;
};

export type RenewalPlan = { id: string; slug: string; active?: boolean };

/**
 * The membership type a member moves to on 1 January of `year` because of their age, or null.
 * Mirrors `prepare_membership_age_transitions` and `ensure_membership_age_transition` in the database.
 */
export function ageTransitionSlug(currentSlug: string, dateOfBirth: string | null | undefined, year: number): "adult" | "concession" | null {
  if (!dateOfBirth) return null;
  const age = ageOn(dateOfBirth, new Date(Date.UTC(year, 0, 1)));
  if (currentSlug === "junior" && age >= 18) return "adult";
  if (currentSlug === "student" && age >= 25) return "adult";
  if (currentSlug === "adult" && age >= 80) return "concession";
  return null;
}

export type RenewalPrice = { plan_id: string; membership_year: number; amount_pence: number };
export type RenewalTransition = { member_id: string; membership_year: number; status: string; to_plan_id: string | null };
export type RenewalTerm = { member_id: string; membership_year: number; status: string; amount_due_pence: number; amount_paid_pence: number; source: string };

export type RenewalChoice = {
  member_id: string;
  membership_year: number;
  amount_pence: number | null;
  note: string;
};

/** Members whose membership can be renewed by an officer: never suspended, archived or currently honorary. */
export function renewableMembers<T extends RenewalMember>(members: T[]): T[] {
  return members.filter((member) => {
    if (!member.current_plan_id || ["suspended", "archived"].includes(member.effective_state)) return false;
    if (member.effective_state !== "honorary") return true;
    return Boolean(member.honorary_memberships?.some((item) => item.revoked_effective_on));
  });
}

/**
 * The amount an officer should record for each renewable member and membership year, or the reason
 * no payment can be recorded. This mirrors the checks the recording action repeats on the server.
 * `prices` must be ordered newest membership year first, so an earlier fee carries forward.
 */
export function buildRenewalChoices(input: {
  members: RenewalMember[];
  prices: RenewalPrice[];
  transitions: RenewalTransition[];
  terms: RenewalTerm[];
  /** When given, an age change that has not been recorded yet is still priced at the new type's fee. */
  plans?: RenewalPlan[];
  currentYear: number;
  formatMoney: (pence: number) => string;
}): RenewalChoice[] {
  const { members, prices, transitions, terms, plans, currentYear, formatMoney } = input;
  return renewableMembers(members).flatMap((member) => [currentYear, currentYear + 1].map((membershipYear): RenewalChoice => {
    const honoraryRows = member.honorary_memberships;
    const honoraryForYear = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.effective_from <= `${membershipYear}-12-31`
      && (!item.revoked_effective_on || item.revoked_effective_on > `${membershipYear}-01-01`)) ?? null;
    const honoraryTransition = honoraryRows?.find((item) => ["active", "scheduled"].includes(item.status)
      && item.revoked_effective_on?.startsWith(`${membershipYear}-`) && item.replacement_plan_id) ?? null;
    if (honoraryForYear && !honoraryTransition) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "Honorary membership covers this year, so no payment should be recorded.",
    };
    const recorded = transitions.find((item) => item.member_id === member.id && item.membership_year === membershipYear);
    const currentSlug = plans?.find((plan) => plan.id === member.current_plan_id)?.slug;
    const expectedSlug = !recorded && currentSlug ? ageTransitionSlug(currentSlug, member.date_of_birth, membershipYear) : null;
    const expectedPlan = expectedSlug ? plans?.find((plan) => plan.slug === expectedSlug && plan.active !== false) : undefined;
    const transition = recorded ?? (expectedPlan ? { status: "scheduled", to_plan_id: expectedPlan.id } : undefined);
    if (transition?.status === "awaiting_student_review") return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "The Student membership request must be decided before payment is recorded.",
    };
    const planId = honoraryTransition?.replacement_plan_id ?? transition?.to_plan_id ?? member.current_plan_id;
    const price = prices.find((item) => item.plan_id === planId && item.membership_year === membershipYear)
      ?? prices.find((item) => item.plan_id === planId && item.membership_year < membershipYear);
    if (!price) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: `No annual fee is available for ${membershipYear}.`,
    };
    const term = terms.find((item) => item.member_id === member.id && item.membership_year === membershipYear);
    if (term?.status === "paid" && term.amount_paid_pence >= term.amount_due_pence) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: `This member's ${membershipYear} membership is already paid.`,
    };
    if (term?.status === "payment_review") return {
      member_id: member.id, membership_year: membershipYear, amount_pence: null,
      note: "Resolve the existing payment review before recording another payment.",
    };
    if (term?.status === "scheduled" && term.amount_paid_pence === 0 && ["officer", "application"].includes(term.source)) return {
      member_id: member.id, membership_year: membershipYear, amount_pence: term.amount_due_pence,
      note: "This is the amount already due for the pending membership term.",
    };
    if (honoraryTransition?.revoked_effective_on && !honoraryTransition.revoked_effective_on.endsWith("-01-01")) {
      const transitionDate = new Date(`${honoraryTransition.revoked_effective_on}T12:00:00Z`);
      return {
        member_id: member.id, membership_year: membershipYear,
        amount_pence: proratedMembershipFee(price.amount_pence, transitionDate),
        note: `Reduced from the ${formatMoney(price.amount_pence)} annual fee from the date honorary membership ends.`,
      };
    }
    return {
      member_id: member.id, membership_year: membershipYear, amount_pence: price.amount_pence,
      note: `Full annual fee for ${membershipYear}.`,
    };
  }));
}
