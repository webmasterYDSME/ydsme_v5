import "server-only";
import { resolveSiteOrigin } from "./site-origin.mjs";

export function getTrustedAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const fallback = process.env.NODE_ENV === "production" ? null : "http://localhost:3010";
  const value = configured || fallback;
  if (!value) throw new Error("NEXT_PUBLIC_SITE_URL must be configured.");

  return resolveSiteOrigin(value);
}
