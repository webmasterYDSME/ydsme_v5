export function ageOn(dateOfBirth: string, onDate = new Date()) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  let age = onDate.getUTCFullYear() - year;
  const beforeBirthday = onDate.getUTCMonth() + 1 < month
    || (onDate.getUTCMonth() + 1 === month && onDate.getUTCDate() < day);
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
  return onDate.getUTCFullYear() + (onDate.getUTCMonth() === 11 ? 1 : 0);
}

export function membershipRenewalYear(onDate = new Date()) {
  return onDate.getUTCFullYear() + (onDate.getUTCMonth() >= 10 ? 1 : 0);
}

export function membershipRenewalIsOpen(onDate = new Date()) {
  return onDate.getUTCMonth() >= 10 || onDate.getUTCMonth() <= 2;
}

export function proratedMembershipFee(annualPence: number, onDate = new Date()) {
  const month = onDate.getUTCMonth() + 1;
  return month === 12 ? annualPence : Math.round(annualPence * (13 - month) / 12);
}

export function membershipRenewalAt(membershipYear: number) {
  return new Date(Date.UTC(membershipYear + 1, 0, 1, 0, 0, 0));
}
