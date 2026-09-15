export const SITE_URL = "https://yorkmodelengineers.co.uk";

export function resolveSiteOrigin(value) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }
  // Vercel redirects this legacy hostname to the club's canonical domain.
  // Normalize configuration only; incoming request origins still match exactly.
  return url.origin === "https://www.yorkmodelengineers.co.uk" ? SITE_URL : url.origin;
}
