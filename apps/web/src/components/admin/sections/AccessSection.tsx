"use client";

import { useEffect, useState } from "react";
import { KeyRound, Link2, Plus, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { PASSWORD_MIN } from "@fana/core/account";
import { adminApi } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input, PasswordInput } from "@/components/ui/Input";
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

export function AccessSection() {
  const refreshKey = useRefreshKey();
  const { data, loading, error, busy, run } = useAdminResource(async () => {
    const [accounts, token, path] = await Promise.all([
      adminApi.admins(),
      adminApi.apiToken(),
      adminApi.adminPath(),
    ]);
    return { admins: accounts.admins, token: token.token, path };
  }, refreshKey);

  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "" });
  const [resetting, setResetting] = useState<{ id: string; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [ownPassword, setOwnPassword] = useState({ current: "", next: "" });
  /** Plaintext of a freshly generated API token — shown once, never refetchable. */
  const [freshToken, setFreshToken] = useState<string | null>(null);
  /** Null until loaded, then the editable copy of the dashboard path. */
  const [pathDraft, setPathDraft] = useState<string | null>(null);

  // Adopt the stored path once, without clobbering what the operator is typing.
  useEffect(() => {
    if (pathDraft === null && data?.path) setPathDraft(data.path.path);
  }, [data, pathDraft]);

  async function createAdmin() {
    const username = newUser.username.trim().toLowerCase();
    const ok = await run("create", () => adminApi.createAdmin(username, newUser.password));
    if (ok) {
      setCreating(false);
      setNewUser({ username: "", password: "" });
      toast.success(`${username} can now sign in.`);
    }
  }

  async function resetOther() {
    if (!resetting) return;
    const { username } = resetting;
    const ok = await run("reset", () =>
      adminApi.resetAdminPassword(resetting.id, resetPassword),
    );
    if (ok) {
      toast.success(`Password reset for ${username}`, {
        description: "Their other sessions were signed out.",
      });
      setResetting(null);
      setResetPassword("");
    }
  }

  async function changeOwn() {
    const ok = await run("own-password", () =>
      adminApi.changeOwnPassword(ownPassword.current, ownPassword.next),
    );
    if (ok) {
      setOwnPassword({ current: "", next: "" });
      toast.success("Password changed", {
        description: "Other browsers signed in as you were signed out.",
      });
    }
  }

  async function regenerate() {
    let token: string | undefined;
    const ok = await run("token", async () => {
      token = (await adminApi.regenerateApiToken()).token;
    });
    if (ok && token) setFreshToken(token);
  }

  async function moveDashboard() {
    const next = (pathDraft ?? "").trim().toLowerCase();
    const ok = await run("admin-path", () => adminApi.saveAdminPath(next));
    if (ok) {
      toast.success(`Dashboard moved to /${next}`, {
        description: "Taking you to the new URL…",
      });
      // The page we're on no longer exists — follow the move rather than 404.
      setTimeout(() => window.location.assign(`/${next}/access`), 900);
    }
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <Panel
        title="Admins"
        icon={<Users className="h-4 w-4 text-accent" />}
        action={
          <Button size="sm" onClick={() => setCreating(true)} disabled={busy !== null}>
            <UserPlus className="h-4 w-4" />
            Add admin
          </Button>
        }
      >
        {loading ? (
          <SkeletonRows rows={2} />
        ) : (
          <ul className="divide-y divide-rule">
            {data?.admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {a.username}
                    {a.isSelf && <Badge tone="accent">you</Badge>}
                  </p>
                  <p className="text-xs text-ink-2">
                    last sign-in {relative(a.lastLoginAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!a.isSelf && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => setResetting({ id: a.id, username: a.username })}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy !== null}
                        onClick={() => void run(a.id, () => adminApi.deleteAdmin(a.id))}
                        aria-label={`Delete ${a.username}`}
                        className="hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Your password" icon={<KeyRound className="h-4 w-4 text-accent" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password">
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="current-password"
                value={ownPassword.current}
                onChange={(e) =>
                  setOwnPassword({ ...ownPassword, current: e.target.value })
                }
              />
            )}
          </Field>
          <Field label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={ownPassword.next}
                onChange={(e) => setOwnPassword({ ...ownPassword, next: e.target.value })}
              />
            )}
          </Field>
        </div>
        <Button
          size="sm"
          className="mt-3"
          disabled={
            busy !== null ||
            !ownPassword.current ||
            ownPassword.next.length < PASSWORD_MIN
          }
          onClick={() => void changeOwn()}
        >
          Change password
        </Button>
      </Panel>

      <Panel title="Dashboard URL" icon={<Link2 className="h-4 w-4 text-accent" />}>
        <Field
          label="Path"
          hint="One segment. Moving it off /admin keeps scanners away from the sign-in form — pair it with an IP allowlist at your proxy if this instance is public."
        >
          {(props) => (
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="shrink-0 font-mono text-sm text-ink-2">/</span>
                <Input
                  {...props}
                  value={pathDraft ?? ""}
                  onChange={(e) => setPathDraft(e.target.value)}
                  placeholder="admin"
                  autoCapitalize="off"
                  spellCheck={false}
                  mono
                />
              </div>
              <Button
                size="sm"
                disabled={
                  busy !== null ||
                  !pathDraft?.trim() ||
                  pathDraft.trim().toLowerCase() === data?.path.path
                }
                onClick={() => void moveDashboard()}
              >
                Move
              </Button>
            </div>
          )}
        </Field>
        {data?.path && data.path.path !== data.path.default && (
          <p className="mt-2 text-xs text-warn">
            /{data.path.default} now returns 404. Keep this URL somewhere safe — it is
            not shown anywhere else.
          </p>
        )}
      </Panel>

      <Panel title="API token" icon={<KeyRound className="h-4 w-4 text-accent" />}>
        {loading ? (
          <SkeletonRows rows={1} />
        ) : (
          <>
            <p className="text-sm text-ink-2">
              Machine token for scripts and monitoring — send it in an{" "}
              <code className="rounded-sm bg-paper-3 px-1 py-0.5 font-mono text-xs text-ink">
                Authorization: Bearer
              </code>{" "}
              header. Only its hash is stored, so it can be replaced but never re-read.
            </p>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-rule bg-paper p-3">
              <div className="min-w-0">
                {data?.token ? (
                  <p className="flex items-baseline gap-1.5 text-sm">
                    <code className="font-mono tracking-tight">{data.token.prefix}</code>
                    <span aria-label="rest hidden" className="text-ink-2">
                      ••••••••
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-ink-2">No token yet.</p>
                )}
                {data?.token && (
                  <p className="text-xs text-ink-2">
                    created {relative(data.token.createdAt)} · last used{" "}
                    {relative(data.token.lastUsedAt)}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void regenerate()}
              >
                <RefreshCw className="h-4 w-4" />
                {data?.token ? "Regenerate" : "Generate"}
              </Button>
            </div>
            {data?.token && (
              <p className="mt-2 text-xs text-warn">
                Regenerating invalidates the current token immediately.
              </p>
            )}
          </>
        )}
      </Panel>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent
          title="Add admin"
          icon={<Plus className="h-4 w-4 text-accent" />}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={
                  busy !== null ||
                  newUser.username.trim().length < 3 ||
                  newUser.password.length < PASSWORD_MIN
                }
                onClick={() => void createAdmin()}
              >
                Add admin
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Username" hint="Letters, digits, dot, dash, underscore.">
              {(props) => (
                <Input
                  {...props}
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Password" hint={`At least ${PASSWORD_MIN} characters.`}>
              {(props) => (
                <PasswordInput
                  {...props}
                  autoComplete="new-password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              )}
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resetting !== null} onOpenChange={(open) => !open && setResetting(null)}>
        <DialogContent
          title={`Reset password${resetting ? ` · ${resetting.username}` : ""}`}
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          description="They'll be signed out everywhere and will need the new password."
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy !== null || resetPassword.length < PASSWORD_MIN}
                onClick={() => void resetOther()}
              >
                Reset password
              </Button>
            </>
          }
        >
          <Field label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoFocus
              />
            )}
          </Field>
        </DialogContent>
      </Dialog>

      <Dialog open={freshToken !== null} onOpenChange={(open) => !open && setFreshToken(null)}>
        <DialogContent
          title="New API token"
          icon={<KeyRound className="h-4 w-4 text-accent" />}
          description="Copy it now — this is the only time it's shown."
          footer={
            <Button size="sm" onClick={() => setFreshToken(null)}>
              Done
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-rule bg-paper p-3 font-mono text-xs">
              {freshToken}
            </code>
            <CopyButton value={freshToken ?? ""} toastMessage="API token copied" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
