import "server-only";

export const membershipBillingEnabled = () => process.env.ENABLE_MEMBERSHIP_BILLING === "true";
export const membershipAdministrationEnabled = () => membershipBillingEnabled()
  || process.env.ENABLE_MEMBERSHIP_ADMIN === "true";
