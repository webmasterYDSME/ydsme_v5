/** November and the December boundary are GMT in Europe/London. */
export function membershipCheckoutWindow(now = new Date()) {
  if (now.getUTCMonth() !== 10) return { expiresAt: undefined, paused: false };
  const cutoff = Date.UTC(now.getUTCFullYear(), 11, 1);
  // Stripe requires >=30 minutes; leave a minute for the API request.
  return {
    expiresAt: Math.floor(Math.min(now.getTime() + 23 * 3600_000, cutoff) / 1000),
    paused: cutoff - now.getTime() <= 31 * 60_000,
  };
}

export function membershipCheckoutQuoteKey(priceId: string, year: number, amount: number) {
  return `${priceId}:${year}:${amount}`;
}
