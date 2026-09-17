"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import type { ServedDomain } from "@/lib/api";
import { isValidLocalPart } from "@/lib/validate";
import { Button } from "./ui/Button";
import { CopyButton } from "./ui/CopyButton";
import { DomainSelect } from "./DomainSelect";
import { QrButton } from "./QrButton";
import { Tooltip } from "./ui/Tooltip";

interface Props {
  address: string | null;
  domains: string[];
  domainDetails: ServedDomain[];
  connected: boolean;
  onApply: (local: string, domain: string) => void;
  onGenerate: () => void;
  onRefresh: () => Promise<void> | void;
}

function split(address: string | null): { local: string; domain: string } {
  if (!address) return { local: "", domain: "" };
  const [local = "", domain = ""] = address.split("@");
  return { local, domain };
}

/** "3 days" / "5 hours" — the coarse age shown next to the live dot. */
function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return hours >= 1 ? `${hours}h` : "today";
}

export function Toolbar({
  address,
  domains,
  domainDetails,
  connected,
  onApply,
  onGenerate,
  onRefresh,
}: Props) {
  const current = split(address);
  const [local, setLocal] = useState(current.local);
  const [domain, setDomain] = useState(current.domain || domains[0] || "");
  const [refreshing, setRefreshing] = useState(false);

  // Keep the editable fields in sync when the address changes externally.
  useEffect(() => {
    setLocal(current.local);
    setDomain(current.domain || domains[0] || "");
  }, [address, domains]); // eslint-disable-line react-hooks/exhaustive-deps

  // Community domains carry a verification date; built-ins have always been on.
  const activeSince =
    domainDetails.find((d) => d.domain === domain)?.activeSince ?? null;

  const valid = isValidLocalPart(local);
  const neutral = local.trim() === "" || valid;

  function apply(nextDomain = domain) {
    const trimmed = local.trim().toLowerCase() || current.local;
    if (!valid || (trimmed === current.local && nextDomain === current.domain)) return;
    onApply(trimmed, nextDomain);
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // Keep the spin visible briefly even when the refresh is instant.
      setTimeout(() => setRefreshing(false), 450);
    }
  }

  return (
    <section className="rounded-card border border-rule bg-paper-2 p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">
          Your temporary address
        </span>
        <div className="flex items-center gap-3">
          {activeSince && (
            <Tooltip
              content={`${domain} verified ${new Date(activeSince).toLocaleString()}`}
            >
              <span
                tabIndex={0}
                className="inline-flex cursor-default items-center gap-1.5 rounded-sm text-xs text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-good" />
                active {sinceLabel(activeSince)}
              </span>
            </Tooltip>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-good" : "bg-ink-2"}`}
            />
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      {/* Editable address: name + domain */}
      <div
        className={`mt-3 flex items-center rounded-md border bg-paper transition focus-within:ring-4 ${
          neutral
            ? "border-rule focus-within:border-accent focus-within:ring-accent-soft"
            : "border-warn focus-within:ring-warn-soft"
        }`}
      >
        <input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => apply()}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          spellCheck={false}
          placeholder="your-name"
          aria-label="Mailbox name"
          className="min-w-0 flex-1 bg-transparent px-3.5 py-3 font-mono text-base outline-none sm:text-lg"
        />
        <span className="font-mono text-base text-ink-2 sm:text-lg">@</span>
        {domains.length > 1 ? (
          <DomainSelect
            value={domain}
            domains={domains}
            onChange={(d) => {
              setDomain(d);
              apply(d);
            }}
          />
        ) : (
          <span className="pl-1 pr-3.5 font-mono text-base text-ink sm:text-lg">
            {domain}
          </span>
        )}
      </div>
      {!neutral && (
        <p className="mt-2 text-xs text-warn">
          Use only letters, numbers, dots or dashes.
        </p>
      )}

      {/* Actions — Copy is primary */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <CopyButton
          value={address ?? ""}
          label="Copy"
          variant="primary"
          disabled={!address}
          className="flex-1"
        />
        <Button variant="outline" onClick={onGenerate}>
          <Sparkles className="h-4 w-4" />
          New
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={refresh}
          aria-label="Refresh inbox"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <QrButton address={address} />
      </div>
    </section>
  );
}
