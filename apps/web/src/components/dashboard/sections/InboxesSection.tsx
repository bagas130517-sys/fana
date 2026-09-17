"use client";

import { useState } from "react";
import { AlertTriangle, Inbox, Lock, Mail, Trash2 } from "lucide-react";
import { accountApi, type HeldInbox } from "@/lib/accountApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "@/components/admin/RefreshContext";
import { Panel } from "@/components/admin/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { DataTable } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toaster";

/** How much of the hold is left. The reservation is what a slot is spent on. */
function remaining(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "expiring";
  if (mins < 60) return `${mins}m left`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h left`;
  return `${Math.floor(mins / 1440)}d left`;
}

/**
 * The inboxes this account is holding. They're minted with a key, not from here
 * — this is where a customer sees what's using up their `concurrentInboxes` and
 * lets one go, which is otherwise a limit they can hit with nothing to act on.
 */
export function InboxesSection() {
  const refreshKey = useRefreshKey();
  const [page, setPage] = useState(1);
  const { data, loading, error, busy, run } = useAdminResource(
    () => accountApi.inboxes(page),
    `${refreshKey}:${page}`,
  );

  const [confirming, setConfirming] = useState<HeldInbox | null>(null);

  async function release(inbox: HeldInbox) {
    setConfirming(null);
    await run(inbox.address, async () => {
      const { deleted } = await accountApi.releaseInbox(inbox.address);
      toast.success(
        deleted > 0 ? `Released — ${deleted} message(s) deleted` : "Inbox released",
      );
    });
  }

  const inboxes = data?.inboxes ?? [];
  const limit = data?.limit ?? 0;

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel
        title="Inboxes"
        icon={<Inbox className="h-4 w-4 text-accent" />}
        action={
          !loading && (
            <span className="text-xs text-ink-2">
              {limit > 0
                ? `${data?.total ?? 0} of ${limit} held`
                : `${data?.total ?? 0} held`}
            </span>
          )
        }
      >
        <DataTable
          rows={inboxes}
          loading={loading}
          busy={busy !== null}
          rowKey={(i) => i.address}
          page={data ?? undefined}
          onPage={setPage}
          empty={
            <>
              No inboxes held — create one with{" "}
              <code className="font-mono text-xs">POST /v1/inboxes</code>.
            </>
          }
          columns={[
            {
              key: "address",
              header: "Address",
              cell: (i) => (
                <span className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm text-accent">
                    {i.address}
                  </span>
                  <CopyButton value={i.address} toastMessage="Address copied" />
                </span>
              ),
            },
            {
              key: "visibility",
              header: "Visibility",
              cell: (i) =>
                i.private ? (
                  <Badge tone="accent">
                    <Lock className="h-3 w-3" />
                    private
                  </Badge>
                ) : (
                  <Badge tone="neutral">public</Badge>
                ),
            },
            {
              key: "messages",
              header: "Mail",
              secondary: true,
              cell: (i) => (
                <span className="inline-flex items-center gap-1 text-ink-2">
                  <Mail className="h-3 w-3" />
                  {i.messages}
                </span>
              ),
            },
            {
              key: "held",
              header: "Hold",
              secondary: true,
              cell: (i) => (
                <span className="text-ink-2">{remaining(i.reservedUntil)}</span>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              cell: (i) => (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy !== null}
                  onClick={() => setConfirming(i)}
                  aria-label={`Release ${i.address}`}
                  className="hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ),
            },
          ]}
        />

        <p className="mt-3 text-xs text-ink-2">
          An inbox is held for as long as your plan keeps mail, then the address
          goes back to the pool on its own. Releasing one early frees a slot
          immediately. Emptying an inbox with{" "}
          <code className="font-mono">DELETE /v1/inboxes/:address</code> keeps the
          address, so it doesn&apos;t.
        </p>
      </Panel>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent
          title="Release this inbox?"
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
          description="The address goes back to the pool and its mail is deleted. This cannot be undone."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy !== null}
                onClick={() => confirming && void release(confirming)}
              >
                Release
              </Button>
            </>
          }
        >
          <p className="break-all font-mono text-sm">{confirming?.address}</p>
          <p className="mt-1 text-xs text-ink-2">
            {confirming?.messages ?? 0} message(s) will be deleted with it.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
