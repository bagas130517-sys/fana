"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Layers,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { planInputSchema, type PlanInput } from "@fana/core/plans";
import { adminApi, type ApiKeySummary, type Plan } from "@/lib/adminApi";
import { accountApi } from "@/lib/accountApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { Pager } from "@/components/ui/Pager";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toaster";

const BLANK_PLAN: PlanInput = {
  slug: "",
  label: "",
  monthlyRequests: 50_000,
  requestsPerMinute: 120,
  retentionMinutes: 7 * 24 * 60,
  concurrentInboxes: 50,
};

const NUMERIC: {
  key: keyof Omit<PlanInput, "slug" | "label">;
  label: string;
  hint: string;
}[] = [
  { key: "monthlyRequests", label: "Requests / month", hint: "0 = unlimited" },
  { key: "requestsPerMinute", label: "Requests / minute", hint: "burst, 0 = unlimited" },
  { key: "retentionMinutes", label: "Retention (minutes)", hint: "how long mail is kept" },
  { key: "concurrentInboxes", label: "Concurrent inboxes", hint: "0 = unlimited" },
];

function relative(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function retentionLabel(minutes: number): string {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

/**
 * Accounts first, keys second — a plan belongs to a customer, so this is the
 * screen where you see who is on what and move them. Their keys hang off the
 * row they belong to rather than in one undifferentiated list.
 */
export function CustomersSection() {
  const refreshKey = useRefreshKey();
  // Page is part of the resource key, so turning a page refetches rather than
  // filtering rows the browser was never given.
  const [page, setPage] = useState(1);
  const { data, loading, error, busy, run } = useAdminResource(async () => {
    const [customers, keys, plans, mine] = await Promise.all([
      adminApi.customers(page),
      adminApi.apiKeys(),
      adminApi.plans(),
      accountApi.keys(),
    ]);
    return {
      customers: customers.users,
      pageInfo: {
        page: customers.page,
        perPage: customers.perPage,
        total: customers.total,
        pages: customers.pages,
      },
      keys: keys.keys,
      plans: plans.plans,
      mine: mine.keys,
    };
  }, `${refreshKey}:${page}`);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [issuingFor, setIssuingFor] = useState<{ id: string; username: string } | null>(
    null,
  );
  const [label, setLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanInput>(BLANK_PLAN);

  const customers = data?.customers ?? [];
  const plans = data?.plans ?? [];
  const planSlugs = plans.map((p) => p.slug);

  const keysFor = (username: string): ApiKeySummary[] =>
    (data?.keys ?? []).filter((k) => k.owner === username);

  async function issueKey() {
    if (!issuingFor) return;
    let key: string | undefined;
    const ok = await run("issue", async () => {
      key = (
        await adminApi.createApiKey({ label: label.trim() || "Default", user: issuingFor.id })
      ).key;
    });
    if (ok && key) {
      setIssuingFor(null);
      setLabel("");
      setIssued(key);
    }
  }

  async function issueForSelf() {
    let key: string | undefined;
    const ok = await run("issue-self", async () => {
      key = (await accountApi.createKey("Operator testing")).key;
    });
    if (ok && key) setIssued(key);
  }

  async function addPlan() {
    const parsed = planInputSchema.safeParse(planDraft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid plan");
      return;
    }
    if (await run("create-plan", () => adminApi.createPlan(parsed.data))) {
      setCreatingPlan(false);
      setPlanDraft(BLANK_PLAN);
      toast.success(`Plan ${parsed.data.slug} added`);
    }
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel title="Customers" icon={<Users className="h-4 w-4 text-accent" />}>
        {loading ? (
          <SkeletonRows rows={3} />
        ) : customers.length === 0 ? (
          <p className="text-sm text-ink-2">No accounts yet.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {customers.map((cust) => {
              const keys = keysFor(cust.username);
              const open = expanded === cust.id;

              return (
                <li key={cust.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : cust.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ink-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-2" />
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 truncate text-sm font-medium">
                          {cust.username}
                          {cust.role === "admin" && <Badge tone="neutral">operator</Badge>}
                        </span>
                        <span className="block truncate text-xs text-ink-2">
                          {cust.email ?? "no email"} · {cust.keys} key
                          {cust.keys === 1 ? "" : "s"} · {cust.usage.toLocaleString()}
                          {cust.monthlyRequests > 0 &&
                            `/${cust.monthlyRequests.toLocaleString()}`}{" "}
                          this month · seen {relative(cust.lastLoginAt)}
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Select
                        value={cust.plan}
                        items={planSlugs}
                        ariaLabel={`Plan for ${cust.username}`}
                        onValueChange={(plan) =>
                          void run(cust.id, async () => {
                            await adminApi.moveUserPlan(cust.id, plan);
                            toast.success(`${cust.username} moved to ${plan}`, {
                              description: "Every key they hold follows the account.",
                            });
                          })
                        }
                        triggerClassName="border border-rule px-2 py-1 text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          setIssuingFor({ id: cust.id, username: cust.username })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Key
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <ul className="mt-2 space-y-1.5 border-l border-rule pl-6">
                      {keys.length === 0 ? (
                        <li className="py-1 text-xs text-ink-2">No keys yet.</li>
                      ) : (
                        keys.map((k) => (
                          <li
                            key={k.id}
                            className="flex items-center justify-between gap-3 py-1"
                          >
                            <span className="min-w-0 text-xs">
                              <span className="font-medium">{k.label}</span>{" "}
                              <code className="font-mono text-ink-2">{k.prefix}</code>
                              <span className="text-ink-2">
                                {"•".repeat(6)} · {k.usage.toLocaleString()} req · used{" "}
                                {relative(k.lastUsedAt)}
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy !== null}
                              onClick={() =>
                                void run(k.id, () => adminApi.revokeApiKey(k.id))
                              }
                              aria-label={`Revoke ${k.label}`}
                              className="hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {/* Rows expand to show a customer's keys, so this list is not a plain
            table — but the endpoint pages like every other, and an operator with
            four hundred customers needs the pager either way. */}
        <Pager info={data?.pageInfo} busy={busy !== null} onPage={setPage} />

        <p className="mt-3 text-xs text-ink-2">
          A plan belongs to the account: changing it moves every key that customer holds,
          and they all share one quota.
        </p>
      </Panel>

      <Panel
        title="Your own keys"
        icon={<KeyRound className="h-4 w-4 text-accent" />}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void issueForSelf()}
          >
            <Plus className="h-4 w-4" />
            Issue for myself
          </Button>
        }
      >
        {loading ? (
          <SkeletonRows rows={1} />
        ) : (data?.mine ?? []).length === 0 ? (
          <p className="text-sm text-ink-2">
            None yet — issue one to try the API as a customer would.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {data?.mine.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-sm">
                  {k.label}{" "}
                  <code className="font-mono text-xs text-ink-2">{k.prefix}</code>
                  <span className="text-xs text-ink-2">
                    {"•".repeat(6)} · {k.usage.toLocaleString()} req
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy !== null}
                  onClick={() => void run(k.id, () => accountApi.revokeKey(k.id))}
                  aria-label={`Revoke ${k.label}`}
                  className="hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Plans"
        icon={<Layers className="h-4 w-4 text-accent" />}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => setCreatingPlan(true)}
          >
            <Plus className="h-4 w-4" />
            Add plan
          </Button>
        }
      >
        {loading ? (
          <SkeletonRows rows={1} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-2">
                  <th className="py-2 font-medium">Plan</th>
                  <th className="py-2 font-medium">Req/mo</th>
                  <th className="py-2 font-medium">Req/min</th>
                  <th className="py-2 font-medium">Retention</th>
                  <th className="py-2 font-medium">Inboxes</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {plans.map((p) => (
                  <PlanRow
                    key={p.slug}
                    plan={p}
                    inUse={customers.filter((c) => c.plan === p.slug).length}
                    busy={busy !== null}
                    onSave={(limits) =>
                      void run(`plan:${p.slug}`, async () => {
                        await adminApi.updatePlan(p.slug, limits);
                        toast.success(`${p.label} updated`);
                      })
                    }
                    onDelete={() =>
                      void run(`plan:${p.slug}`, () => adminApi.deletePlan(p.slug))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-2">
          Retention is the cost driver: mail sent to an inbox created with a key lives as
          long as that account&apos;s plan says, not the instance default.
        </p>
      </Panel>

      <Dialog open={issuingFor !== null} onOpenChange={(o) => !o && setIssuingFor(null)}>
        <DialogContent
          title={`Issue a key${issuingFor ? ` for ${issuingFor.username}` : ""}`}
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          description="It inherits that account's plan."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setIssuingFor(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void issueKey()}>
                Issue key
              </Button>
            </>
          }
        >
          <Field label="Label" hint="What this key is for — CI, staging, a customer's app.">
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

      <Dialog open={issued !== null} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent
          title="New API key"
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          description="Copy it now — only its hash is stored, so this is the only time it's shown."
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
            <CopyButton value={issued ?? ""} toastMessage="API key copied" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingPlan} onOpenChange={(o) => !o && setCreatingPlan(false)}>
        <DialogContent
          title="Add a plan"
          icon={<Layers className="h-4 w-4 text-accent" />}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setCreatingPlan(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy !== null} onClick={() => void addPlan()}>
                Add plan
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Slug" hint="Used in the API, e.g. pro.">
                {(props) => (
                  <Input
                    {...props}
                    value={planDraft.slug}
                    onChange={(e) => setPlanDraft({ ...planDraft, slug: e.target.value })}
                    placeholder="pro"
                    mono
                    autoFocus
                  />
                )}
              </Field>
              <Field label="Label">
                {(props) => (
                  <Input
                    {...props}
                    value={planDraft.label}
                    onChange={(e) => setPlanDraft({ ...planDraft, label: e.target.value })}
                    placeholder="Pro"
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {NUMERIC.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      value={planDraft[f.key]}
                      onChange={(e) =>
                        setPlanDraft({ ...planDraft, [f.key]: Number(e.target.value) })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One plan row, editable in place — limits change more often than they're created. */
function PlanRow({
  plan,
  inUse,
  busy,
  onSave,
  onDelete,
}: {
  plan: Plan;
  inUse: number;
  busy: boolean;
  onSave: (limits: Partial<Plan>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(plan);
  const dirty = NUMERIC.some((f) => draft[f.key] !== plan[f.key]);

  return (
    <tr>
      <td className="py-2">
        <span className="font-medium">{plan.label}</span>
        <span className="ml-1.5 font-mono text-xs text-ink-2">{plan.slug}</span>
        <span className="ml-1.5 text-xs text-ink-2">
          · {inUse} account{inUse === 1 ? "" : "s"}
        </span>
      </td>
      {NUMERIC.map((f) => (
        <td key={f.key} className="py-2 pr-2">
          <Input
            aria-label={`${plan.label} ${f.label}`}
            type="number"
            size="sm"
            value={draft[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
            className="w-24"
          />
          {f.key === "retentionMinutes" && (
            <span className="ml-1 text-xs text-ink-2">{retentionLabel(draft[f.key])}</span>
          )}
        </td>
      ))}
      <td className="py-2 text-right">
        <div className="flex justify-end gap-1.5">
          {dirty && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                onSave({
                  monthlyRequests: draft.monthlyRequests,
                  requestsPerMinute: draft.requestsPerMinute,
                  retentionMinutes: draft.retentionMinutes,
                  concurrentInboxes: draft.concurrentInboxes,
                })
              }
            >
              Save
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy || inUse > 0}
            onClick={onDelete}
            aria-label={`Delete ${plan.label}`}
            className="hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
