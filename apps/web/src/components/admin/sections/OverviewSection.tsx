"use client";

import {
  Activity,
  Database,
  Globe,
  Inbox,
  MailCheck,
  Paperclip,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { adminApi, formatBytes } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { StatCard } from "../StatCard";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { ActivityChart } from "../ActivityChart";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

const VERDICTS = [
  { key: "verified", label: "Verified", tone: "good", bar: "bg-good" },
  { key: "unverified", label: "Unverified", tone: "neutral", bar: "bg-ink-2" },
  { key: "suspicious", label: "Suspicious", tone: "warn", bar: "bg-warn" },
] as const;

export function OverviewSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error } = useAdminResource(async () => {
    const [stats, activity] = await Promise.all([
      adminApi.stats(),
      adminApi.activity(),
    ]);
    return { stats, activity: activity.activity };
  }, refreshKey);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[5.5rem]" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-danger">{error ?? "Failed to load."}</p>;
  }

  const { stats, activity } = data;
  const authTotal = Object.values(stats.verdicts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Messages"
          value={stats.messages}
          sub={`${stats.unseen} unread`}
          icon={MailCheck}
        />
        <StatCard label="Last 24h" value={stats.last24h} icon={Activity} />
        <StatCard label="Active inboxes" value={stats.activeMailboxes} icon={Inbox} />
        <StatCard
          label="Attachments"
          value={stats.attachments}
          sub={formatBytes(stats.storageBytes)}
          icon={Paperclip}
        />
        <StatCard label="Reservations" value={stats.reservations} icon={Ticket} />
        <StatCard
          label="Expired, pending purge"
          value={stats.expiredPending}
          icon={Database}
        />
        <StatCard label="Built-in domains" value={stats.domains.builtin} icon={Globe} />
        <StatCard
          label="Community domains"
          value={stats.domains.communityVerified}
          sub={`${stats.domains.communityPending} pending`}
          icon={ShieldCheck}
        />
      </div>

      <Panel title="Inbound activity" icon={<Activity className="h-4 w-4 text-accent" />}>
        <ActivityChart data={activity} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Sender authentication"
          icon={<ShieldCheck className="h-4 w-4 text-accent" />}
        >
          {authTotal === 0 ? (
            <p className="text-sm text-ink-2">No mail received yet.</p>
          ) : (
            <>
              {/* One bar, three segments — the share matters more than the counts. */}
              <div className="flex h-2 overflow-hidden rounded-sm bg-paper-3">
                {VERDICTS.map((v) => (
                  <div
                    key={v.key}
                    className={v.bar}
                    style={{ width: `${(stats.verdicts[v.key] / authTotal) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-2">
                {VERDICTS.map((v) => (
                  <li key={v.key} className="flex items-center justify-between gap-3 text-sm">
                    <Badge tone={v.tone}>{v.label}</Badge>
                    <span className="tabular-nums text-ink-2">
                      {stats.verdicts[v.key]}
                      <span className="ml-1.5">
                        ({Math.round((stats.verdicts[v.key] / authTotal) * 100)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-2">
                SPF/DKIM/DMARC results for everything this instance has received.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Busiest inboxes" icon={<Inbox className="h-4 w-4 text-accent" />}>
          {stats.topMailboxes.length === 0 ? (
            <p className="text-sm text-ink-2">No mail received yet.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {stats.topMailboxes.map((m) => (
                <li
                  key={m.mailbox}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="truncate font-mono text-xs">{m.mailbox}</span>
                  <span className="shrink-0 tabular-nums text-sm text-ink-2">
                    {m.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
