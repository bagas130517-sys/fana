"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { accountApi, type Delivery, type Webhook } from "@/lib/accountApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "@/components/admin/RefreshContext";
import { Panel } from "@/components/admin/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { DataTable } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toaster";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_TONE: Record<string, "good" | "warn" | "danger" | "neutral"> = {
  delivered: "good",
  pending: "warn",
  sending: "warn",
  failed: "danger",
};

/** The attempts for one endpoint — this is the "why didn't it arrive?" answer. */
function Deliveries({ webhook }: { webhook: Webhook }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useAdminResource(
    () => accountApi.deliveries(webhook.id, page),
    `${webhook.id}:${page}`,
  );
  const rows: Delivery[] = data?.deliveries ?? [];

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(d) => d.id}
      page={data ?? undefined}
      onPage={setPage}
      empty="Nothing delivered yet."
      columns={[
        {
          key: "status",
          header: "Status",
          cell: (d) => <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge>,
        },
        { key: "when", header: "When", cell: (d) => ago(d.createdAt) },
        {
          key: "attempts",
          header: "Attempts",
          secondary: true,
          cell: (d) => d.attempts,
        },
        {
          key: "http",
          header: "HTTP",
          secondary: true,
          cell: (d) => (d.lastStatus === null ? "—" : <span className="font-mono">{d.lastStatus}</span>),
        },
        {
          key: "error",
          header: "Error",
          cell: (d) =>
            d.lastError ? (
              <span className="block max-w-[18rem] truncate text-danger" title={d.lastError}>
                {d.lastError}
              </span>
            ) : (
              <span className="text-ink-2">—</span>
            ),
        },
      ]}
    />
  );
}

/**
 * Endpoints the account pushes mail to. Registered here or through `/v1` — both
 * answer from the same module, so this is a view of the same list a script sees.
 */
export function WebhooksSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error, busy, run } = useAdminResource(
    () => accountApi.webhooks(),
    refreshKey,
  );

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [confirming, setConfirming] = useState<Webhook | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tested, setTested] = useState<
    Record<string, { ok: boolean; status?: number; error?: string }>
  >({});

  async function test(hook: Webhook) {
    await run(`test:${hook.id}`, async () => {
      // A failing test answers 502, which `req` throws on — the failure *is*
      // the result here, so it is caught and shown rather than surfaced as a
      // broken page.
      try {
        const result = await accountApi.testWebhook(hook.id);
        setTested((t) => ({ ...t, [hook.id]: result }));
        toast.success(`Endpoint answered ${result.status ?? 200}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : "Request failed";
        setTested((t) => ({ ...t, [hook.id]: { ok: false, error } }));
        toast.error("Test delivery failed");
      }
    });
  }

  async function create() {
    const ok = await run("create", async () => {
      await accountApi.createWebhook(url.trim(), label.trim());
      toast.success("Endpoint added");
    });
    if (ok) {
      setAdding(false);
      setUrl("");
      setLabel("");
    }
  }

  const hooks = data?.webhooks ?? [];

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel
        title="Webhooks"
        icon={<WebhookIcon className="h-4 w-4 text-accent" />}
        action={
          <Button size="sm" disabled={busy !== null} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add endpoint
          </Button>
        }
      >
        {loading ? (
          <SkeletonRows rows={2} />
        ) : hooks.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-2">
            No endpoints yet. Add one and every message your keys receive is
            POSTed to it.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {hooks.map((h) => (
              <li key={h.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm">{h.url}</span>
                      {h.label && <Badge tone="neutral">{h.label}</Badge>}
                      {!h.enabled && (
                        <Badge tone="danger">
                          <AlertTriangle className="h-3 w-3" />
                          disabled
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-ink-2">
                      Last delivery {ago(h.lastDeliveryAt)}
                      {h.failures > 0 && ` · ${h.failures} failed in a row`}
                    </p>
                    {h.lastError && (
                      <p className="mt-1 truncate text-xs text-danger">{h.lastError}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={h.enabled}
                      disabled={busy !== null}
                      onCheckedChange={(next) =>
                        void run(h.id, async () => {
                          await accountApi.setWebhookEnabled(h.id, next);
                          toast.success(next ? "Endpoint enabled" : "Endpoint paused");
                        })
                      }
                      aria-label={h.enabled ? "Pause endpoint" : "Enable endpoint"}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy !== null}
                      onClick={() => setConfirming(h)}
                      aria-label={`Remove ${h.url}`}
                      className="hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-2">Signing secret</span>
                  <code className="rounded-md border border-rule bg-paper px-2 py-1 font-mono text-xs">
                    {h.secret.slice(0, 12)}
                    {"•".repeat(8)}
                  </code>
                  <CopyButton value={h.secret} toastMessage="Secret copied" />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void test(h)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(open === h.id ? null : h.id)}
                  >
                    {open === h.id ? "Hide" : "Recent deliveries"}
                  </Button>
                </div>

                {/* Kept next to the button rather than only in a toast: this is
                    the line someone reads while fixing the endpoint. */}
                {tested[h.id] && (
                  <p
                    className={`mt-2 text-xs ${tested[h.id]!.ok ? "text-good" : "text-danger"}`}
                  >
                    {tested[h.id]!.ok
                      ? `Endpoint answered ${tested[h.id]!.status} — signature verified on their side if they checked it.`
                      : tested[h.id]!.error}
                  </p>
                )}

                {open === h.id && (
                  <div className="mt-2 rounded-md border border-rule p-3">
                    <Deliveries webhook={h} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-ink-2">
          Every request carries{" "}
          <code className="font-mono">X-Fana-Signature</code> — an HMAC of the
          body and a timestamp, using the secret above. Verify it before trusting
          the payload; anyone who learns your URL can post to it otherwise. An
          endpoint that fails repeatedly is paused automatically, and turning it
          back on here clears the count.
        </p>
      </Panel>

      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DialogContent
          title="Add endpoint"
          icon={<WebhookIcon className="h-4 w-4 text-accent" />}
          description="Every message your keys receive is POSTed here."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void create()}>
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="URL" hint="Must be https and reachable from the internet.">
              {(props) => (
                <Input
                  {...props}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.example.com/fana"
                  autoFocus
                />
              )}
            </Field>
            <Field label="Label" hint="For your own reference — CI, staging.">
              {(props) => (
                <Input
                  {...props}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="CI"
                />
              )}
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent
          title="Remove this endpoint?"
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
          description="Deliveries stop immediately and its history is deleted."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  const target = confirming;
                  setConfirming(null);
                  if (target) {
                    void run(target.id, async () => {
                      await accountApi.deleteWebhook(target.id);
                      toast.success("Endpoint removed");
                    });
                  }
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="break-all font-mono text-sm">{confirming?.url}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
