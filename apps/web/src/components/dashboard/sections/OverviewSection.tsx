"use client";

import Link from "next/link";
import { Activity, ArrowRight, BookOpen, Gauge, KeyRound, Timer } from "lucide-react";
import { accountApi } from "@/lib/accountApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "@/components/admin/RefreshContext";
import { Panel } from "@/components/admin/Panel";
import { StatCard } from "@/components/admin/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";

function retention(minutes: number): string {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}

/** What the customer needs on landing: their plan, usage so far, and the two calls. */
export function OverviewSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error } = useAdminResource(() => accountApi.keys(), refreshKey);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[5.5rem]" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-danger">{error ?? "Failed to load."}</p>;
  }

  const { plan, usage, keys } = data;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Plan" value={plan.label} icon={Gauge} />
        <StatCard
          label="Requests this month"
          value={usage.toLocaleString()}
          sub={
            plan.monthlyRequests > 0
              ? `of ${plan.monthlyRequests.toLocaleString()}`
              : "unlimited"
          }
          icon={Activity}
        />
        <StatCard
          label="API keys"
          value={keys.length}
          sub="all on this plan"
          icon={KeyRound}
        />
        <StatCard label="Mail kept" value={retention(plan.retentionMinutes)} icon={Timer} />
      </div>

      {keys.length === 0 && (
        <Panel title="Get a key" icon={<KeyRound className="h-4 w-4 text-accent" />}>
          <p className="text-sm text-ink-2">
            You don&apos;t have an API key yet. One is enough to start.
          </p>
          <Link
            href="/dashboard/keys"
            className="mt-3 inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
          >
            Create a key
          </Link>
        </Panel>
      )}

      {/* The samples used to be copied in here, which meant two places to keep
          right. They live at /docs now, rendered against this instance. */}
      <Panel title="Quickstart" icon={<BookOpen className="h-4 w-4 text-accent" />}>
        <p className="text-sm text-ink-2">
          Create an inbox, trigger the mail, and block until it arrives — then
          read the one-time code straight out of the body. Inboxes made with a
          key are private: only your keys can read them.
        </p>
        <Link
          href="/docs"
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
        >
          Read the API reference
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-3 text-xs text-ink-2">
          Every response carries <code className="font-mono">X-Quota-Remaining</code>, so a
          client can back off before it runs out.
        </p>
      </Panel>
    </div>
  );
}
