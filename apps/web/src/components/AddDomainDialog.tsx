"use client";

import { useState } from "react";
import { AlertTriangle, Check, Globe, Loader2 } from "lucide-react";
import { api, type DomainResult } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { Button } from "./ui/Button";
import { Dialog, DialogContent } from "./ui/Dialog";
import { Input } from "./ui/Input";

interface Props {
  onClose: () => void;
  onVerified: () => void;
}

export function AddDomainDialog({ onClose, onVerified }: Props) {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<DomainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True after a check that came back still-unverified — drives the notice.
  const [stillPending, setStillPending] = useState(false);

  async function run(fn: () => Promise<DomainResult>) {
    setLoading(true);
    setError(null);
    try {
      const r = await fn();
      setResult(r);
      setStillPending(!r.verified);
      if (r.verified) {
        onVerified();
        void celebrate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const submit = () => {
    const d = domain.trim().toLowerCase();
    if (d) void run(() => api.addDomain(d));
  };
  const recheck = () => result && void run(() => api.verifyDomain(result.domain));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Add your domain"
        icon={<Globe className="h-4 w-4 text-accent" />}
      >
        <div className="space-y-4">
          {result?.verified ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-good-soft text-good">
                <Check className="h-5 w-5" />
              </span>
              <p className="font-medium">{result.domain} is live!</p>
              <p className="text-sm text-ink-2">
                You can now use{" "}
                <span className="font-mono text-ink">anything@{result.domain}</span>{" "}
                as an address.
              </p>
              <Button onClick={onClose} className="mt-2">
                Done
              </Button>
            </div>
          ) : result ? (
            <>
              <p className="text-sm text-ink-2">
                Almost there. Add this DNS record at your domain registrar, then
                check again:
              </p>
              <div className="rounded-md border border-rule bg-paper p-3 font-mono text-xs">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <dt className="text-ink-2">Type</dt>
                  <dd>MX</dd>
                  <dt className="text-ink-2">Priority</dt>
                  <dd>1</dd>
                  <dt className="text-ink-2">Host</dt>
                  <dd className="break-all">{result.domain}</dd>
                  <dt className="text-ink-2">Value</dt>
                  <dd className="break-all text-accent">{result.mxHost}</dd>
                </dl>
              </div>
              <p className="text-xs text-ink-2">
                DNS can take a few minutes to a day to update.
              </p>
              {stillPending && !loading && (
                <div className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Not verified yet — we couldn&apos;t find an MX record for{" "}
                    <strong>{result.domain}</strong>
                    {result.mxHost ? (
                      <>
                        {" "}
                        pointing to <strong>{result.mxHost}</strong>
                      </>
                    ) : null}
                    . Double-check the record and give DNS a little longer.
                  </span>
                </div>
              )}
              <Button onClick={recheck} disabled={loading} className="w-full">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Checking…" : "Check again"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">
                Own a domain? Point its email (MX) to fana and use{" "}
                <span className="font-mono text-ink">anything@yourdomain</span> for
                temporary email. Reception only.
              </p>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                spellCheck={false}
                placeholder="yourdomain.com"
                aria-label="Your domain"
                size="lg"
                mono
                autoFocus
              />
              <Button onClick={submit} disabled={loading} className="w-full">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Adding…" : "Add domain"}
              </Button>
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
