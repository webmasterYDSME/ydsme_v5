import "server-only";

import { createPublicClient, publicStorageUrl } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultDonationSettings, parseDonationSettings } from "@/lib/donations";

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
  booking_capacity: number | null;
  booked_places: number;
  available_places: number;
};

export type CommitteeRecord = {
  id: number;
  user_id: string | null;
  name: string;
  title: string;
  file_url: string;
  email: string;
};

export async function getPublicEvents() {
  const supabase = createPublicClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("events")
    .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link,booking_enabled,booking_capacity")
    .eq("event_type", "public")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(`Unable to load public events: ${error.message}`);
  const events = data ?? [];
  if (!events.length) return [] as EventRecord[];

  const { data: bookings, error: bookingError } = await createAdminClient()
    .from("event_bookings")
    .select("event_id,party_size,status")
    .in("event_id", events.map((event) => event.id))
    .in("status", ["confirmed", "checked_in"]);
  if (bookingError) throw new Error(`Unable to load event availability: ${bookingError.message}`);

  const totals = new Map<number, number>();
  for (const booking of bookings ?? []) {
    totals.set(booking.event_id, (totals.get(booking.event_id) ?? 0) + booking.party_size);
  }
  return events.map((event) => {
    const bookedPlaces = totals.get(event.id) ?? 0;
    return {
      ...event,
      booked_places: bookedPlaces,
      available_places: event.booking_capacity ? Math.max(0, event.booking_capacity - bookedPlaces) : 0,
    };
  }) as EventRecord[];
}

export async function getBookableEvent(id: number) {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: event, error } = await admin.from("events")
    .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link,booking_enabled,booking_capacity")
    .eq("id", id)
    .eq("event_type", "public")
    .gte("end_date", today)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the event: ${error.message}`);
  if (!event?.booking_enabled || !event.booking_capacity) return null;

  const { data: bookings, error: bookingError } = await admin.from("event_bookings")
    .select("party_size")
    .eq("event_id", id)
    .in("status", ["confirmed", "checked_in"]);
  if (bookingError) throw new Error(`Unable to load event availability: ${bookingError.message}`);
  const bookedPlaces = (bookings ?? []).reduce((total, booking) => total + booking.party_size, 0);
  return {
    ...event,
    booked_places: bookedPlaces,
    available_places: Math.max(0, event.booking_capacity - bookedPlaces),
  } as EventRecord;
}

export async function getCommittees() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("committees")
    .select("id,user_id,name,title,file_url,email")
    .order("id", { ascending: true });
  if (error) throw new Error(`Unable to load the committee: ${error.message}`);
  return (data ?? []) as CommitteeRecord[];
}

export async function getDonationSettings() {
  const supabase = createPublicClient();
  const admin = createAdminClient();
  const [{ data, error }, { data: raisedPence, error: totalError }] = await Promise.all([
    supabase.from("configs").select("settings").limit(1).maybeSingle(),
    admin.rpc("target_donation_total_pence"),
  ]);

  if (error || !data) return defaultDonationSettings;
  const donations = parseDonationSettings(data.settings);
  return {
    ...donations,
    target: {
      ...donations.target,
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
