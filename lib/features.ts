import "server-only";

export const visitorBookingsEnabled = () => process.env.ENABLE_VISITOR_BOOKINGS === "true";
export const donationsEnabled = () => process.env.ENABLE_DONATIONS === "true";
export const membershipBillingEnabled = () => process.env.ENABLE_MEMBERSHIP_BILLING === "true";
export const membershipAdministrationEnabled = () => membershipBillingEnabled()
  || process.env.ENABLE_MEMBERSHIP_ADMIN === "true";
