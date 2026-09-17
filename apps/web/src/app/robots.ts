import type { MetadataRoute } from "next";

/**
 * The dashboard is `noindex` wherever it is served from, which is what actually
 * keeps it out of a search index. Only the default path is named here — the
 * configured one is a secret, and robots.txt is public.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: ["/admin"] },
  };
}
