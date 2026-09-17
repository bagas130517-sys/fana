"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { accountApi } from "@/lib/accountApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "@/components/admin/RefreshContext";
import { Panel } from "@/components/admin/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** The customer's own keys: create, copy once, revoke. */
export function KeysSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error, busy, run } = useAdminResource(
    () => accountApi.keys(),
    refreshKey,
  );

  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  async function create() {
    let key: string | undefined;
    const ok = await run("create", async () => {
      key = (await accountApi.createKey(label.trim() || "Default")).key;
    });
    if (ok && key) {
      setCreating(false);
      setLabel("");
      setIssued(key);
    }
  }

  const keys = data?.keys ?? [];
  const plan = data?.plan;

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel
        title="API keys"
        icon={<KeyRound className="h-4 w-4 text-accent" />}
        action={
          <Button size="sm" disabled={busy !== null} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New key
          </Button>
        }
      >
        {loading ? (
          <SkeletonRows rows={2} />
        ) : keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">
            No keys yet — create one to start calling the API.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{k.label}</p>
                  <p className="truncate text-xs text-ink-2">
                    <code className="font-mono">{k.prefix}</code>
                    {"•".repeat(8)} · {k.usage.toLocaleString()} requests this month ·
                    used {relative(k.lastUsedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(k.id, async () => {
                      await accountApi.revokeKey(k.id);
                      toast.success("Key revoked");
                    })
                  }
                  aria-label={`Revoke ${k.label}`}
                  className="hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-2">
          {plan && (
            <>
              All your keys share the{" "}
              <Badge tone="accent">{plan.label}</Badge> quota —{" "}
              {plan.monthlyRequests > 0
                ? `${data!.usage.toLocaleString()} of ${plan.monthlyRequests.toLocaleString()} used`
                : `${data!.usage.toLocaleString()} used`}{" "}
              this month. Holding a second key doesn&apos;t buy more.{" "}
            </>
          )}
          Only a hash of each key is stored, so a lost key can be revoked but never
          shown again.
        </p>
      </Panel>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent
          title="New API key"
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void create()}>
                Create
              </Button>
            </>
          }
        >
          <Field label="Label" hint="For your own reference — CI, staging, laptop.">
            {(props) => (
              <Input
                {...props}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="CI"
                autoFocus
              />
            )}
          </Field>
        </DialogContent>
      </Dialog>

      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent
          title="Your new key"
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          description="Copy it now — this is the only time it's shown."
          footer={
            <Button size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-rule bg-paper p-3 font-mono text-xs">
              {issued}
            </code>
            <CopyButton value={issued ?? ""} toastMessage="Key copied" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
