import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";

const BOOKING_SECURITY_COOKIE = "ydsme-booking-security";
const BOOKING_SECURITY_COOKIE_MAX_AGE = 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashingSecret() {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("A booking-abuse hashing secret is required.");
  return secret;
}

function clientAddress(headerList: Headers) {
  return headerList.get("cf-connecting-ip")
    || headerList.get("x-real-ip")
    || headerList.get("x-forwarded-for")?.split(",")[0]?.trim()
    || null;
}

function eventScopedHash(secret: string, kind: "device" | "ip", eventId: number, value: string) {
  return createHmac("sha256", secret)
    .update(`visitor-booking-${kind}\0${eventId}\0${value}`)
    .digest("hex");
}

export async function bookingAbuseIdentifiers(eventId: number) {
  const secret = hashingSecret();
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(BOOKING_SECURITY_COOKIE)?.value;
  const deviceToken = existingToken && UUID_PATTERN.test(existingToken) ? existingToken : randomUUID();

  if (deviceToken !== existingToken) {
    cookieStore.set(BOOKING_SECURITY_COOKIE, deviceToken, {
      httpOnly: true,
      maxAge: BOOKING_SECURITY_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  const address = clientAddress(await headers());
  return {
    deviceHash: eventScopedHash(secret, "device", eventId, deviceToken),
    ipHash: address ? eventScopedHash(secret, "ip", eventId, address) : null,
  };
}
