import "server-only";

import { connection } from "next/server";
import { createPublicClient, publicStorageUrl } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultDonationSettings } from "@/lib/donations";
import { donationsEnabled, visitorBookingsEnabled } from "@/lib/features";
import {
  ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  fitAnnouncementText,
} from "@/lib/announcements";
import { safeHttpUrl } from "@/lib/security-input";

export type EventRecord = {
  id: number;
  name: string;
  descriptions: string;
  file_url: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  event_type: "public" | "member_only";
  display_in_homepage: boolean;
  is_ticket_required: boolean;
  reservation_link: string;
  booking_enabled: boolean;
  booking_mode: "none" | "external" | "website";
  booking_capacity: number | null;
  booked_places: number;
  available_places: number;
};

export type CommitteeRecord = {
  id: number;
  name: string;
  title: string;
  file_url: string;
  email: string;
};

export type AnnouncementRecord = {
  id: number;
  title: string;
  body: string;
  published_at: string;
  updated_at: string;
};

export type PostalAddress = {
  address_line_one: string;
  address_line_two: string;
  city: string;
  postcode: string;
  country: string;
};

export type PublicSiteConfig = {
  shortName: string;
  fullName: string;
  registeredName: string;
  companyNumber: string;
  website: string;
  email: string;
  telephone: string;
  clubAddress: PostalAddress;
  registeredAddress: PostalAddress;
  socialLinks: Array<{ name: string; url: string }>;
};

const defaultClubAddress: PostalAddress = {
  address_line_one: "Dringhouses",
  address_line_two: "",
  city: "York",
  postcode: "YO24 2JE",
  country: "United Kingdom",
};

const defaultRegisteredAddress: PostalAddress = {
  address_line_one: "Hill House",
  address_line_two: "Stocks Hill, Huggate",
  city: "York",
  postcode: "YO42 1YQ",
  country: "United Kingdom",
};

export const defaultPublicSiteConfig: PublicSiteConfig = {
  shortName: "YCDSME",
  fullName: "York City & District Society of Model Engineers",
  registeredName: "York City & District Society of Model Engineers Limited",
  companyNumber: "26478R",
  website: "https://www.yorkmodelengineers.co.uk",
  email: "secretary@yorkmodelengineers.co.uk",
  telephone: "",
  clubAddress: defaultClubAddress,
  registeredAddress: defaultRegisteredAddress,
  socialLinks: [{ name: "Facebook", url: "https://www.facebook.com/YorkModelEngineers" }],
};

function asAddress(value: unknown, fallback: PostalAddress): PostalAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const address = value as Record<string, unknown>;
  const field = (name: keyof PostalAddress) => typeof address[name] === "string" ? address[name].trim() : fallback[name];
  return {
    address_line_one: field("address_line_one"),
    address_line_two: field("address_line_two"),
    city: field("city"),
    postcode: field("postcode"),
    country: field("country"),
  };
}

type PublicEventRow = Omit<EventRecord, "booked_places" | "available_places">;

function isMissingProjection(error: { code?: string } | null) {
  // Only support the known expand-migration gap. Permission or policy failures
  // must remain failures and must never fall through to an operational table.
  return error?.code === "PGRST205";
}

export async function getPublicEvents() {
  await connection();
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const projection = await supabase
    .from("public_events")
    .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link,booking_enabled,booking_mode,booking_capacity")
    .eq("event_type", "public")
    .eq("lifecycle_status", "published")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true });
  let events: PublicEventRow[];
  if (isMissingProjection(projection.error)) {
    const legacy = await supabase
      .from("events")
      .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link,booking_enabled,booking_capacity")
      .eq("event_type", "public")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (legacy.error) throw new Error("Unable to load public events.");
    events = (legacy.data ?? []).map((event) => ({
      ...event,
      booking_mode: event.booking_enabled ? "website" : event.reservation_link ? "external" : "none",
    })) as PublicEventRow[];
  } else {
    if (projection.error) throw new Error("Unable to load public events.");
    events = (projection.data ?? []) as unknown as PublicEventRow[];
  }
  if (!events.length) return [] as EventRecord[];

  const { data: bookings, error: bookingError } = await createAdminClient()
    .from("event_bookings")
    .select("event_id,party_size,status")
    .in("event_id", events.map((event) => event.id))
    .in("status", ["confirmed", "checked_in"]);
  if (bookingError) throw new Error("Unable to load event availability.");

  const totals = new Map<number, number>();
  for (const booking of bookings ?? []) {
    totals.set(booking.event_id, (totals.get(booking.event_id) ?? 0) + booking.party_size);
  }
  return events.map((event) => {
    const bookedPlaces = totals.get(event.id) ?? 0;
    return {
      ...event,
      booking_enabled: event.booking_enabled && visitorBookingsEnabled(),
      booked_places: bookedPlaces,
      available_places: event.booking_capacity ? Math.max(0, event.booking_capacity - bookedPlaces) : 0,
    };
  }) as EventRecord[];
}

export async function getBookableEvent(id: number) {
  await connection();
  if (!visitorBookingsEnabled()) return null;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: event, error } = await admin.from("events")
    .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link,booking_enabled,booking_mode,booking_capacity")
    .eq("id", id)
    .eq("event_type", "public")
    .eq("lifecycle_status", "published")
    .gte("end_date", today)
    .maybeSingle();
  if (error) throw new Error("Unable to load the event.");
  if (!event || event.booking_mode !== "website" || !event.booking_enabled || !event.booking_capacity) return null;

  const { data: bookings, error: bookingError } = await admin.from("event_bookings")
    .select("party_size")
    .eq("event_id", id)
    .in("status", ["confirmed", "checked_in"]);
  if (bookingError) throw new Error("Unable to load event availability.");
  const bookedPlaces = (bookings ?? []).reduce((total, booking) => total + booking.party_size, 0);
  return {
    ...event,
    booked_places: bookedPlaces,
    available_places: Math.max(0, event.booking_capacity - bookedPlaces),
  } as EventRecord;
}

export async function getCommittees() {
  await connection();
  const supabase = createPublicClient();
  const projection = await supabase
    .from("public_committee_roster")
    .select("id,name,title,file_url,email")
    .order("id", { ascending: true });
  if (isMissingProjection(projection.error)) {
    const legacy = await supabase
      .from("committees")
      .select("id,name,title,file_url,email")
      .order("id", { ascending: true });
    if (legacy.error) throw new Error("Unable to load the committee.");
    return (legacy.data ?? []) as CommitteeRecord[];
  }
  if (projection.error) throw new Error("Unable to load the committee.");
  return (projection.data ?? []) as CommitteeRecord[];
}

export async function getPublicAnnouncements(limit?: number) {
  await connection();
  const supabase = createPublicClient();
  let query = supabase
    .from("public_announcements")
    .select("id,title,body,published_at,updated_at")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (isMissingProjection(error)) return [] as AnnouncementRecord[];
  if (error) throw new Error("Unable to load public announcements.");
  return (data ?? []) as AnnouncementRecord[];
}

export async function getCarriageAnnouncements(limit = 6) {
  const announcements = await getPublicAnnouncements(limit);
  return announcements.map((announcement) => ({
    ...announcement,
    title: fitAnnouncementText(announcement.title, ANNOUNCEMENT_TITLE_MAX_LENGTH),
    body: fitAnnouncementText(announcement.body, ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH),
  }));
}

export async function getPublicSiteConfig() {
  await connection();
  const supabase = createPublicClient();
  const [configResult, linksResult] = await Promise.all([
    supabase
      .from("public_site_config")
      .select("short_name,full_name,registered_name,company_no,website,email,telephone,club_address,registered_address")
      .maybeSingle(),
    supabase
      .from("public_site_links")
      .select("name,url,position")
      .eq("link_type", "social")
      .order("position", { ascending: true }),
  ]);

  if (isMissingProjection(configResult.error)) return defaultPublicSiteConfig;
  if (configResult.error || !configResult.data) throw new Error("Unable to load public Society information.");
  if (linksResult.error && !isMissingProjection(linksResult.error)) throw new Error("Unable to load public Society links.");

  const config = configResult.data;
  const socialLinks = (linksResult.data ?? []).flatMap((link) => {
    const url = safeHttpUrl(link.url);
    return link.name?.trim() && url ? [{ name: link.name.trim(), url }] : [];
  });
  return {
    shortName: config.short_name?.trim() || defaultPublicSiteConfig.shortName,
    fullName: config.full_name?.trim() || defaultPublicSiteConfig.fullName,
    registeredName: config.registered_name?.trim() || defaultPublicSiteConfig.registeredName,
    companyNumber: config.company_no?.trim() || defaultPublicSiteConfig.companyNumber,
    website: safeHttpUrl(config.website) || defaultPublicSiteConfig.website,
    email: config.email?.trim() || defaultPublicSiteConfig.email,
    telephone: config.telephone?.trim() || "",
    clubAddress: asAddress(config.club_address, defaultClubAddress),
    registeredAddress: asAddress(config.registered_address, defaultRegisteredAddress),
    socialLinks,
  } satisfies PublicSiteConfig;
}

export async function getDonationSettings() {
  await connection();
  if (!donationsEnabled()) return defaultDonationSettings;
  const admin = createAdminClient();
  const [{ data, error }, { data: raisedPence, error: totalError }] = await Promise.all([
    admin.from("donation_campaigns").select("kind,enabled,title,description,button_label,target_pence"),
    admin.rpc("target_donation_total_pence"),
  ]);

  if (error || !data) return defaultDonationSettings;
  const generic = data.find(item => item.kind === "generic");
  const target = data.find(item => item.kind === "target");
  if (!generic || !target) return defaultDonationSettings;
  return {
    generic: { enabled: generic.enabled, title: generic.title, description: generic.description, buttonLabel: generic.button_label },
    target: {
      enabled: target.enabled,
      title: target.title,
      description: target.description,
      buttonLabel: target.button_label,
      targetPence: Number(target.target_pence),
      raisedPence: totalError ? 0 : Number(raisedPence ?? 0),
    },
  };
}

export function eventImage(path?: string | null) {
  return publicStorageUrl(path, "images") ?? "/images/engine.webp";
}

export function committeeImage(path?: string | null) {
  return publicStorageUrl(path, "images") ?? "/images/track.webp";
}
