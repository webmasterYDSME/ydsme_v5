import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const routes: Array<{
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/visitors", changeFrequency: "monthly", priority: 0.9 },
  { path: "/events", changeFrequency: "weekly", priority: 0.9 },
  { path: "/club-history", changeFrequency: "yearly", priority: 0.7 },
  { path: "/committees", changeFrequency: "monthly", priority: 0.7 },
  { path: "/membership", changeFrequency: "monthly", priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
