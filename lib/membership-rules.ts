export function ageOn(dateOfBirth: string, onDate = new Date()) {
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  let age = onDate.getUTCFullYear() - year;
  const beforeBirthday = onDate.getUTCMonth() + 1 < month
    || (onDate.getUTCMonth() + 1 === month && onDate.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function membershipBillingYear(onDate = new Date()) {
  return onDate.getUTCFullYear() + (onDate.getUTCMonth() === 11 ? 1 : 0);
}

export function proratedMembershipFee(annualPence: number, onDate = new Date()) {
  const month = onDate.getUTCMonth() + 1;
  return month === 12 ? annualPence : Math.round(annualPence * (13 - month) / 12);
}

export function membershipRenewalAt(membershipYear: number) {
  return new Date(Date.UTC(membershipYear + 1, 0, 1, 0, 0, 0));
}
