import type { MetadataRoute } from "next";
import { getPublicFeaturedProjectSitemapEntries } from "@/lib/public-projects";
import { getPublicEvents } from "@/lib/data";
import { upcomingEvents } from "@/lib/public-event-schedule";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const routes: Array<{
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/visitors", changeFrequency: "monthly", priority: 0.9 },
  { path: "/events", changeFrequency: "weekly", priority: 0.9 },
  { path: "/news", changeFrequency: "weekly", priority: 0.8 },
  { path: "/projects", changeFrequency: "weekly", priority: 0.8 },
  { path: "/club-history", changeFrequency: "yearly", priority: 0.7 },
  { path: "/committees", changeFrequency: "monthly", priority: 0.7 },
  { path: "/membership", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookie-policy", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [projects, events] = await Promise.all([getPublicFeaturedProjectSitemapEntries(), getPublicEvents()]);
  const staticRoutes: MetadataRoute.Sitemap = routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
  const projectRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${SITE_URL}/projects/${project.slug}`,
    lastModified: project.published_at,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  const eventRoutes: MetadataRoute.Sitemap = upcomingEvents(events).map(event => ({
    url: `${SITE_URL}/events/${event.id}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));
  return [...staticRoutes, ...projectRoutes, ...eventRoutes];
}
