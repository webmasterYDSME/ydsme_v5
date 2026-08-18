import "server-only";

export const visitorBookingsEnabled = () => process.env.ENABLE_VISITOR_BOOKINGS === "true";
export const donationsEnabled = () => process.env.ENABLE_DONATIONS === "true";
