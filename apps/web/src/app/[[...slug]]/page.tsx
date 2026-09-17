import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InboxApp } from "@/components/InboxApp";
import { AdminEntry } from "@/components/dashboard/AdminEntry";
import { resolveRoute } from "@/lib/adminPath";

// Both the dashboard path and the branding are read per request.
export const dynamic = "force-dynamic";

/**
 * The root is the product's front page and belongs in a search index. Nothing
 * else this route serves does: an address path is somebody's ephemeral inbox,
 * and the operator sign-in is deliberately unadvertised.
 *
 * This used to be a single `index: false` covering the whole route, which kept
 * the dashboard out — and took the home page with it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const isHome = (slug ?? []).length === 0;
  return { robots: { index: isHome, follow: isHome } };
}

/**
 * Optional catch-all. "/" and address paths like "/alias@domain" render the
 * inbox; the configured admin path (default "/admin", changeable in the
 * dashboard itself) renders the operator sign-in. Once that path has been
 * moved, the literal /admin 404s like any other missing page.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const path = slug ?? [];
  const route = await resolveRoute(path);

  if (route.kind === "hidden") notFound();
  // The admin path is the operator's way in; the dashboard itself is /dashboard.
  if (route.kind === "admin") return <AdminEntry />;
  return <InboxApp slug={path} />;
}
