"use client";

import { useState } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SkeletonRows } from "@/components/ui/Skeleton";

export function AbuseSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error, busy, run } = useAdminResource(
    () => adminApi.abuse(),
    refreshKey,
  );
  const [ip, setIp] = useState("");

  async function block(value: string) {
    if (await run(`block:${value}`, () => adminApi.blockIp(value))) setIp("");
  }

  const blocked = new Set(data?.blocked ?? []);

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel
        title="Top sender IPs"
        icon={<ShieldAlert className="h-4 w-4 text-accent" />}
      >
        {loading ? (
          <SkeletonRows rows={3} />
        ) : data && data.topSenders.length > 0 ? (
          <ul className="divide-y divide-rule">
            {data.topSenders.map((s) => (
              <li key={s.ip} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="font-mono text-sm">{s.ip}</span>
                  <span className="ml-2 text-xs text-ink-2">{s.count} messages</span>
                </span>
                {blocked.has(s.ip) ? (
                  <Badge tone="warn">blocked</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void block(s.ip)}
                    className="hover:text-danger"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Block
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No sender activity recorded yet.</p>
        )}
      </Panel>

      <Panel title="Blocked IPs" icon={<Ban className="h-4 w-4 text-accent" />}>
        <div className="mb-3 flex gap-2">
          <Input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ip.trim() && void block(ip.trim())}
            placeholder="Block an IP address"
            aria-label="Block IP"
            mono
            className="min-w-0 flex-1"
          />
          <Button
            variant="danger"
            size="sm"
            disabled={!ip.trim() || busy !== null}
            onClick={() => void block(ip.trim())}
          >
            <Ban className="h-4 w-4" />
            Block
          </Button>
        </div>
        {loading ? (
          <SkeletonRows rows={2} />
        ) : data && data.blocked.length > 0 ? (
          <ul className="divide-y divide-rule">
            {data.blocked.map((b) => (
              <li key={b} className="flex items-center justify-between py-2.5">
                <span className="font-mono text-sm">{b}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void run(`unblock:${b}`, () => adminApi.unblockIp(b))}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No IPs blocked.</p>
        )}
      </Panel>
    </div>
  );
}
