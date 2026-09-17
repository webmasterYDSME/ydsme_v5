// Permit common international formatting while rejecting words and incomplete numbers.
export const membershipPhonePattern = String.raw`\+?[\s\(\)\.\-]*(?:[0-9][\s\(\)\.\-]*){7,15}`;
export const membershipPhoneHint = "Enter a phone number with 7–15 digits. Spaces, brackets, hyphens and a leading + are allowed.";
const phone = new RegExp(`^(?:${membershipPhonePattern})$`);

export function validMembershipPhone(value: string | undefined) {
  return !value?.trim() || (value.trim().length <= 40 && phone.test(value.trim()));
}
