import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Two pages, and that is the whole site as far as a crawler is concerned: the
 * front page and the API reference. Everything else this app serves is either
 * an ephemeral inbox, a dashboard behind a session, or an unadvertised operator
 * path — none of which should be listed, and the inbox space is unbounded
 * anyway.
 */
/**
 * Read per request, not prerendered: `PUBLIC_WEB_URL` is runtime configuration
 * (only `NEXT_PUBLIC_API_URL` is a build arg), so a static sitemap would ship
 * whatever the URL was inside the build container — `localhost` for anyone
 * building the image.
 */
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/docs`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
