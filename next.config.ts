import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const usesLocalSupabase = /^http:\/\/(?:127\.0\.0\.1|localhost):54321(?:\/|$)/.test(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
);

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: usesLocalSupabase,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(usesLocalSupabase
        ? [{ protocol: "http" as const, hostname: "127.0.0.1", port: "54321", pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
  poweredByHeader: false,
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.supabase.co${usesLocalSupabase ? " http://127.0.0.1:54321" : ""}`,
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com${usesLocalSupabase ? " http://127.0.0.1:54321 ws://127.0.0.1:54321" : ""}`,
      "frame-src https://challenges.cloudflare.com",
      ...(isDevelopment || usesLocalSupabase ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
