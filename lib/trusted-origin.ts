import "server-only";

export function getTrustedAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const fallback = process.env.NODE_ENV === "production" ? null : "http://localhost:3010";
  const value = configured || fallback;
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL must be configured.");

  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }
  return url.origin;
}
