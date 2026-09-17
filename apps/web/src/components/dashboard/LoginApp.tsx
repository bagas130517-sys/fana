"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { accountApi, type Provider } from "@/lib/accountApi";
import { getToken, setToken } from "@/lib/adminApi";
import { Wordmark } from "@/components/Wordmark";
import { providerBrand } from "@/components/auth/providerBrand";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";

/**
 * Where customers sign in. Separate from /dashboard so the dashboard can assume
 * a session, and separate from the operator login, which stays on the (possibly
 * secret) admin path.
 */
export function LoginApp() {
  const router = useRouter();
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    // A provider may have just dropped a session in the fragment on the way back.
    const fromCallback = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fromCallback) {
      setToken(fromCallback);
      router.replace("/dashboard");
      return;
    }

    const error = new URLSearchParams(window.location.search).get("error");
    if (error) toast.error(`Sign-in failed: ${error.replace(/_/g, " ")}`);

    if (getToken()) {
      router.replace("/dashboard");
      return;
    }
    void accountApi.providers().then((p) => setProviders(p.providers));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink">
      <div className="w-full max-w-sm rounded-card border border-rule bg-paper-2 p-6 text-center shadow-card">
        {/* Wordmark carries the operator's logo too, when they've set one. */}
        <h1 className="mb-1 flex justify-center">
          <Wordmark />
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          Disposable inboxes your tests can read. Sign in to get an API key.
        </p>

        {providers === null ? (
          <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-ink-2" />
        ) : providers.length > 0 ? (
          <div className="mt-5 space-y-2">
            {providers.map((p) => {
              const { className, icon } = providerBrand(p.id);
              return (
                // `outline` for the shape, then the provider's own colours over
                // the top — tailwind-merge drops the ones they replace, and
                // sizing, focus ring and disabled state stay shared.
                <Button
                  key={p.id}
                  variant="outline"
                  className={`w-full ${className}`}
                  onClick={() => window.location.assign(accountApi.signInUrl(p.id))}
                >
                  {icon}
                  Continue with {p.label}
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-md border border-dashed border-rule p-3 text-sm text-ink-2">
            Sign-in isn&apos;t configured on this instance yet.
          </p>
        )}

        <p className="mt-4 text-xs text-ink-2">
          <Link href="/" className="underline underline-offset-2 hover:text-ink">
            Back to the inbox
          </Link>
        </p>
      </div>
    </div>
  );
}
