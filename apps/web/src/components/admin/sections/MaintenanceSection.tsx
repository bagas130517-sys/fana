"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Gauge,
  Globe,
  LogOut,
  Ticket,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toaster";

function HealthDot({ label, ok }: { label: string; ok: boolean | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${
          ok === undefined ? "bg-rule" : ok ? "bg-good" : "bg-danger"
        }`}
      />
      {label}
      {ok === false && <span className="text-xs text-danger">unreachable</span>}
    </span>
  );
}

/** One maintenance action: what it does, and the button that runs it. */
function Action({
  icon: Icon,
  title,
  description,
  button,
  onRun,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  button: string;
  onRun: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${danger ? "text-danger" : "text-accent"}`}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-ink-2">{description}</p>
        </div>
      </div>
      <Button
        variant={danger ? "danger" : "outline"}
        size="sm"
        disabled={disabled}
        onClick={onRun}
        className="shrink-0"
      >
        {button}
      </Button>
    </div>
  );
}

export function MaintenanceSection() {
  const refreshKey = useRefreshKey();
  const { data, error, busy, run } = useAdminResource(async () => {
    const [health, stats] = await Promise.all([adminApi.health(), adminApi.stats()]);
    return { health, stats };
  }, refreshKey);

  const [mailbox, setMailbox] = useState("");
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);

  /** Run an action and report what it did; the hook handles errors + reload. */
  async function act(key: string, fn: () => Promise<string>) {
    let message = "";
    const ok = await run(key, async () => {
      message = await fn();
    });
    if (ok) toast.success(message);
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel title="Health" icon={<Wrench className="h-4 w-4 text-accent" />}>
        <div className="flex flex-wrap items-center gap-5">
          <HealthDot label="Database" ok={data?.health.db} />
          <HealthDot label="Redis" ok={data?.health.redis} />
          <span className="text-sm text-ink-2">
            {data?.stats.messages ?? "—"} messages · {data?.stats.expiredPending ?? "—"}{" "}
            expired pending
          </span>
        </div>
      </Panel>

      <Panel title="Housekeeping" icon={<Wrench className="h-4 w-4 text-accent" />}>
        <div className="divide-y divide-rule">
          <Action
            icon={Trash2}
            title="Purge expired messages"
            description="Runs the TTL sweep now instead of waiting for the timer."
            button="Purge expired"
            disabled={busy !== null}
            onRun={() =>
              void act("expired", async () => {
                const { deleted } = await adminApi.purgeExpired();
                return `Purged ${plural(deleted, "message")}`;
              })
            }
          />
          <Action
            icon={Ticket}
            title="Release expired reservations"
            description="Frees random addresses whose hold has lapsed so they can be handed out again."
            button="Release"
            disabled={busy !== null}
            onRun={() =>
              void act("reservations", async () => {
                const { released } = await adminApi.releaseReservations();
                return `Released ${plural(released, "reservation")}`;
              })
            }
          />
          <Action
            icon={Globe}
            title="Re-check community domains"
            description="Re-runs MX verification for every registered domain — use after a DNS change."
            button="Re-check"
            disabled={busy !== null}
            onRun={() =>
              void act("domains", async () => {
                const { checked, verified } = await adminApi.recheckDomains();
                return `${verified}/${checked} domains verified`;
              })
            }
          />
          <Action
            icon={Gauge}
            title="Reset rate limits"
            description="Clears per-IP request counters and failed sign-in lockouts. Use when a shared IP locks out real users."
            button="Reset"
            disabled={busy !== null}
            onRun={() =>
              void act("ratelimits", async () => {
                const { cleared } = await adminApi.resetRateLimits();
                return `Cleared ${plural(cleared, "counter")}`;
              })
            }
          />
        </div>
      </Panel>

      <Panel title="Danger zone" icon={<AlertTriangle className="h-4 w-4 text-danger" />}>
        <Field
          label="Purge a mailbox"
          hint="Deletes every message in that inbox. Not reversible."
        >
          {({ id, "aria-describedby": describedBy }) => (
            <div className="flex gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                value={mailbox}
                onChange={(e) => setMailbox(e.target.value)}
                placeholder="user@domain"
                mono
                className="min-w-0 flex-1"
              />
              <Button
                variant="danger"
                size="sm"
                disabled={!mailbox.includes("@") || busy !== null}
                onClick={() =>
                  void act("mailbox", async () => {
                    const { deleted } = await adminApi.purgeMailbox(
                      mailbox.trim().toLowerCase(),
                    );
                    return `Purged ${plural(deleted, "message")}`;
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
                Purge
              </Button>
            </div>
          )}
        </Field>

        <div className="mt-2 divide-y divide-rule">
          <Action
            icon={LogOut}
            title="Sign out every admin"
            description="Revokes all dashboard sessions, including yours. Passwords still work."
            button="Revoke sessions"
            danger
            disabled={busy !== null}
            onRun={() =>
              void act("sessions", async () => {
                const { admins } = await adminApi.revokeAllSessions();
                return `Signed out ${plural(admins, "admin")}`;
              })
            }
          />
          <Action
            icon={Trash2}
            title="Delete all messages"
            description="Empties every inbox on this instance, attachments included."
            button="Delete everything"
            danger
            disabled={busy !== null}
            onRun={() => setConfirmPurgeAll(true)}
          />
        </div>
      </Panel>

      <Dialog
        open={confirmPurgeAll}
        onOpenChange={(open) => !open && setConfirmPurgeAll(false)}
      >
        <DialogContent
          title="Delete all messages?"
          icon={<AlertTriangle className="h-4 w-4 text-danger" />}
          description="Every message and attachment on this instance is deleted immediately. This cannot be undone."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmPurgeAll(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmPurgeAll(false);
                  void act("purge-all", async () => {
                    const { deleted } = await adminApi.purgeAll();
                    return `Deleted ${plural(deleted, "message")}`;
                  });
                }}
              >
                Delete everything
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-2">
            {data ? `${data.stats.messages} messages` : "Messages"} will be removed.
            Inboxes keep working — only what&apos;s stored now is deleted.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
