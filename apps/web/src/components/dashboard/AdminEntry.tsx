"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { accountApi } from "@/lib/accountApi";
import { getToken } from "@/lib/adminApi";
import { AdminLogin } from "@/components/admin/AdminLogin";

/**
 * What the (unadvertised) admin path serves: the operator sign-in form, and
 * nothing else. The dashboard itself lives at /dashboard for everyone — hiding
 * the pages would buy nothing, since the credential endpoint has always been at
 * a fixed URL. Hiding the *form* is what keeps scanners away.
 */
export function AdminEntry() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    // Already signed in: no reason to show a login form.
    accountApi
      .me()
      .then(() => router.replace("/dashboard"))
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-ink">
        <Loader2 className="h-6 w-6 animate-spin text-ink-2" />
      </div>
    );
  }

  return <AdminLogin onLogin={() => router.replace("/dashboard")} />;
}
