import type { Metadata } from "next";
import { getBrand } from "@/lib/site";
import type { PublicPlan } from "@/lib/docs";
import { DocsHeader } from "@/components/docs/DocsHeader";
import { DocsPage } from "@/components/docs/DocsPage";

/**
 * `/docs` — the API reference, served by the instance it documents.
 *
 * A static docs site would be built against one deployment's URL, domains and
 * plan limits, and would be wrong for every self-hoster. This reads all three
 * per request, which is also why it cannot be prerendered.
 *
 * Taking the `/docs` path costs the inbox `docs@<domain>`, the same trade
 * `/login` already made. Worth it: this is the page the product is discovered
 * through, and it needs a URL somebody can guess.
 */
export const dynamic = "force-dynamic";

// Server-side calls stay inside the deploy; the browser gets the public one.
const INTERNAL_API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const title = `API — ${brand.siteName}`;
  const description =
    "Create a disposable inbox over HTTP, wait for the message to arrive, and read the one-time code out of it.";

  return {
    title,
    description,
    // Indexed, like the front page. The rest of this app is ephemeral inboxes
    // and session-gated pages.
    robots: { index: true, follow: true },
    openGraph: { type: "article", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Never let a slow or missing API blank the reference — it is still useful. */
async function load<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${INTERNAL_API}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default async function Page() {
  const [brand, domainData, planData] = await Promise.all([
    getBrand(),
    load<{ domains: string[] }>("/api/domains", { domains: [] }),
    load<{ plans: PublicPlan[] }>("/api/plans", { plans: [] }),
  ]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <DocsHeader />
      <DocsPage
        apiUrl={PUBLIC_API}
        siteName={brand.siteName}
        domains={domainData.domains}
        plans={planData.plans}
      />
    </div>
  );
}
