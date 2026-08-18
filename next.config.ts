import type { NextConfig } from "next";

const usesLocalSupabase = /^http:\/\/(?:127\.0\.0\.1|localhost):54321(?:\/|$)/.test(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
);

const nextConfig: NextConfig = {
  images: {
    qualities: [35, 55, 75],
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
    return [{
      source: "/:path*",
      headers: [
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
