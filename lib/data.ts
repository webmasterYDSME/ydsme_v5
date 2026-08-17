import "server-only";

import { createPublicClient, publicStorageUrl } from "@/lib/supabase/public";

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
    .select("id,name,descriptions,file_url,start_date,end_date,start_time,end_time,event_type,display_in_homepage,is_ticket_required,reservation_link")
    .eq("event_type", "public")
    .gte("end_date", today)
    .order("start_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(`Unable to load public events: ${error.message}`);
  return (data ?? []) as EventRecord[];
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

export function eventImage(path?: string | null) {
  return publicStorageUrl(path, "images") ?? "/images/engine.webp";
}

export function committeeImage(path?: string | null) {
  return publicStorageUrl(path, "images") ?? "/images/track.webp";
}
