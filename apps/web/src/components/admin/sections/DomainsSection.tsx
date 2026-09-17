"use client";

import { useState } from "react";
import { Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { DataTable } from "@/components/ui/DataTable";

export function DomainsSection() {
  const refreshKey = useRefreshKey();
  const [page, setPage] = useState(1);
  const { data, loading, error, busy, run } = useAdminResource(
    () => adminApi.domains(page),
    `${refreshKey}:${page}`,
  );
  const [newDomain, setNewDomain] = useState("");

  async function add() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (await run("add", () => adminApi.addDomain(domain))) setNewDomain("");
  }

  return (
    <Panel title="Domains" icon={<Globe className="h-4 w-4 text-accent" />}>
      <div className="mb-4 flex gap-2">
        <Input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
          placeholder="add-a-domain.com"
          aria-label="Add domain"
          mono
          className="min-w-0 flex-1"
        />
        <Button size="sm" disabled={busy === "add"} onClick={() => void add()}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : (
        data && (
          <>
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-ink-2">Built-in</p>
              <div className="flex flex-wrap gap-1.5">
                {data.builtin.map((d) => (
                  <Badge key={d} tone="neutral" size="md" className="font-mono">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="mb-1.5 text-xs font-medium text-ink-2">Community</p>
            <DataTable
              rows={data.community}
              busy={busy !== null}
              rowKey={(d) => d.domain}
              page={data}
              onPage={setPage}
              empty="No community domains yet."
              columns={[
                {
                  key: "domain",
                  header: "Domain",
                  cell: (d) => <span className="font-mono text-sm">{d.domain}</span>,
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (d) => (
                    <Badge tone={d.verified ? "good" : "warn"}>
                      {d.verified ? "verified" : "pending"}
                    </Badge>
                  ),
                },
                {
                  key: "added",
                  header: "Added",
                  secondary: true,
                  cell: (d) => (
                    <span className="text-ink-2">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  className: "text-right",
                  cell: (d) => (
                    <span className="inline-flex items-center gap-1.5">
                      {!d.verified && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(d.domain, () => adminApi.verifyDomain(d.domain))
                          }
                          aria-label={`Re-check MX for ${d.domain}`}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(d.domain, () => adminApi.revokeDomain(d.domain))
                        }
                        aria-label={`Revoke ${d.domain}`}
                        className="hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  ),
                },
              ]}
            />
          </>
        )
      )}
    </Panel>
  );
}
