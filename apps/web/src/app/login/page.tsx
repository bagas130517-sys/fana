import type { Metadata } from "next";
import { LoginApp } from "@/components/dashboard/LoginApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LoginApp />;
}
