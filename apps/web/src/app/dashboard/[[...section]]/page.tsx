import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "API dashboard",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <DashboardPage section={section?.[0] ?? null} />;
}
