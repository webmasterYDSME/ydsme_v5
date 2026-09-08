import "server-only";

import { unstable_cache } from "next/cache";
import {
  MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG,
  MEMBER_DASHBOARD_EVENTS_CACHE_TAG,
  MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG,
} from "@/lib/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardEvent = {
  id: number;
  name: string;
  start_date: string;
  start_time: string;
  event_type: string;
};

export type DashboardWorkshop = {
  id: string;
  title: string;
  date: string;
  start_time: string;
  venue: string;
  maximum_participants: number;
};

export type DashboardSharedSnapshot = {
  events: DashboardEvent[];
  eventCount: number;
  workshops: DashboardWorkshop[];
  workshopCount: number;
};

async function loadDashboardSharedSnapshot(today: string): Promise<DashboardSharedSnapshot> {
  const admin = createAdminClient();
  const [eventsResult, workshopsResult] = await Promise.all([
    admin.from("events")
      .select("id,name,start_date,start_time,event_type", { count: "exact" })
      .eq("lifecycle_status", "published")
      .gte("end_date", today)
      .order("start_date")
      .limit(6),
    admin.from("workshops")
      .select("id,title,date,start_time,venue,maximum_participants", { count: "exact" })
      .eq("lifecycle_status", "published")
      .gte("date", today)
      .order("date")
      .limit(4),
  ]);
  if (eventsResult.error || workshopsResult.error) {
    throw new Error("Unable to load the member dashboard.");
  }

  return {
    events: (eventsResult.data ?? []) as DashboardEvent[],
    eventCount: eventsResult.count ?? 0,
    workshops: (workshopsResult.data ?? []) as DashboardWorkshop[],
    workshopCount: workshopsResult.count ?? 0,
  };
}

const getCachedDashboardSharedSnapshot = unstable_cache(
  loadDashboardSharedSnapshot,
  ["member-dashboard-shared-snapshot"],
  {
    tags: [
      MEMBER_DASHBOARD_EVENTS_CACHE_TAG,
      MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG,
    ],
    revalidate: 60,
  },
);

export function getDashboardSharedSnapshot(today: string) {
  return getCachedDashboardSharedSnapshot(today);
}

const documentCategoryGroups = {
  minutes: ["minute"],
  publications: ["publication"],
  resources: ["insurance-policy", "club-rule", "calendar", "boiler-guide", "others"],
} as const;

export type MemberDocumentSection = keyof typeof documentCategoryGroups;
type MemberDocumentCategory = (typeof documentCategoryGroups)[MemberDocumentSection][number];
const documentSectionByCategory = new Map<MemberDocumentCategory, MemberDocumentSection>(
  Object.entries(documentCategoryGroups).flatMap(([section, categories]) => categories.map((category) => [
    category,
    section as MemberDocumentSection,
  ] as const)),
);

async function loadMemberDocumentCounts() {
  const admin = createAdminClient();
  const counts: Record<MemberDocumentSection, number> = { minutes: 0, publications: 0, resources: 0 };
  const pageSize = 1000;
  for (let firstRow = 0; ; firstRow += pageSize) {
    const { data, error } = await admin.from("documents")
      .select("category")
      .eq("lifecycle_status", "published")
      .range(firstRow, firstRow + pageSize - 1);
    if (error) throw new Error("Unable to load member document totals.");
    for (const document of data ?? []) {
      const section = documentSectionByCategory.get(document.category);
      if (section) counts[section] += 1;
    }
    if ((data ?? []).length < pageSize) return counts;
  }
}

export const getMemberDocumentCounts = unstable_cache(
  loadMemberDocumentCounts,
  ["member-dashboard-document-counts"],
  { tags: [MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG], revalidate: 300 },
);

export type MemberDocument = {
  id: string;
  name: string;
  descriptions: string;
  category: string;
  created_at: string;
  lifecycle_status: string;
  version: number;
};

async function loadPublishedMemberDocuments(categories: MemberDocumentCategory[], firstRow: number, pageSize: number) {
  const { data, count, error } = await createAdminClient().from("documents")
    .select("id,name,descriptions,category,created_at,lifecycle_status,version", { count: "exact" })
    .in("category", categories)
    .eq("lifecycle_status", "published")
    .order("created_at", { ascending: false })
    .range(firstRow, firstRow + pageSize - 1);
  if (error) throw new Error("Unable to load documents.");
  return { data: (data ?? []) as MemberDocument[], count: count ?? 0 };
}

const getCachedPublishedMemberDocuments = unstable_cache(
  loadPublishedMemberDocuments,
  ["member-dashboard-published-documents"],
  { tags: [MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG], revalidate: 300 },
);

export function getPublishedMemberDocuments(categories: readonly MemberDocumentCategory[], firstRow: number, pageSize: number) {
  return getCachedPublishedMemberDocuments([...categories], firstRow, pageSize);
}

async function loadWorkshopReservationCounts(workshopIds: string[]) {
  if (!workshopIds.length) return [] as Array<{ reference_id: string; reserved_count: number }>;
  const { data, error } = await createAdminClient().from("participants")
    .select("reference_id")
    .in("reference_id", workshopIds)
    .eq("reservation_status", "reserved");
  if (error) throw new Error("Unable to load workshop availability.");
  const totals = new Map<string, number>();
  for (const reservation of data ?? []) {
    totals.set(reservation.reference_id, (totals.get(reservation.reference_id) ?? 0) + 1);
  }
  return [...totals].map(([reference_id, reserved_count]) => ({ reference_id, reserved_count }));
}

const getCachedWorkshopReservationCounts = unstable_cache(
  loadWorkshopReservationCounts,
  ["member-dashboard-workshop-reservations"],
  { tags: [MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG], revalidate: 15 },
);

export function getWorkshopReservationCounts(workshopIds: string[]) {
  return getCachedWorkshopReservationCounts([...workshopIds].sort());
}
