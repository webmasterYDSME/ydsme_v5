import "server-only";
import { cache } from "react";
import { getPublicEvents } from "@/lib/data";
import { upcomingEvents } from "@/lib/public-event-schedule";

// Reuse the public projection and its publication/audience protections.
export const getPublicEventDetail = cache(async (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  return upcomingEvents(await getPublicEvents()).find(event => event.id === Number(id)) ?? null;
});
