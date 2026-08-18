import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { HOLDING_PAGE_PATH, shouldShowHoldingPage } from "@/lib/deployment-visibility.mjs";

const isDevelopment = process.env.NODE_ENV === "development";
const usesLocalSupabase = /^http:\/\/(?:127\.0\.0\.1|localhost):54321(?:\/|$)/.test(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
);

function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.supabase.co${usesLocalSupabase ? " http://127.0.0.1:54321" : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com${usesLocalSupabase ? " http://127.0.0.1:54321 ws://127.0.0.1:54321" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    ...(isDevelopment || usesLocalSupabase ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function secureResponse(response: NextResponse, policy: string) {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host") || request.nextUrl.hostname;
  const hostname = requestHost.split(":")[0];

  if (shouldShowHoldingPage(hostname, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = HOLDING_PAGE_PATH;
    url.search = "";

    const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return secureResponse(response, policy);
  }

  return secureResponse(await updateSession(request, requestHeaders), policy);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
