import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { HOLDING_PAGE_PATH, shouldShowHoldingPage } from "@/lib/deployment-visibility.mjs";

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host") || request.nextUrl.hostname;
  const hostname = requestHost.split(":")[0];

  if (shouldShowHoldingPage(hostname, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = HOLDING_PAGE_PATH;
    url.search = "";

    const response = NextResponse.rewrite(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
