"use client";

import { Settings } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { SkeletonRows } from "@/components/ui/Skeleton";

export function ConfigSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error } = useAdminResource(() => adminApi.config(), refreshKey);

  const rows: [string, string][] = data
    ? [
        ["Domains", data.mailDomains.join(", ")],
        ["Message TTL", `${data.messageTtlMinutes} min`],
        ["Reservation TTL", `${data.reservationTtlMinutes} min`],
        ["Storage driver", data.storageDriver],
        ["Domain verify", data.domainVerify],
        ["MX host", data.mxHost ?? "—"],
        ["API rate limit", `${data.rateLimit.max} / ${data.rateLimit.windowSeconds}s`],
        [
          "SMTP rate limit",
          `${data.smtpRateLimit.max} / ${data.smtpRateLimit.windowSeconds}s`,
        ],
      ]
    : [];

  return (
    <Panel title="Configuration" icon={<Settings className="h-4 w-4 text-accent" />}>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-2">{k}</dt>
              <dd className="truncate text-right font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 text-xs text-ink-2">
        Read-only — these come from the instance environment.
      </p>
    </Panel>
  );
}
