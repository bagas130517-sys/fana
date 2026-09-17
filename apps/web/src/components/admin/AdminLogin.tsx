"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { adminApi, ApiError } from "@/lib/adminApi";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Wordmark } from "@/components/Wordmark";

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Attempts left before the lockout kicks in; null until the API says. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [lockedFor, setLockedFor] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password || loading) return;

    setLoading(true);
    setError(null);
    try {
      await adminApi.login(username.trim().toLowerCase(), password);
      onLogin();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError(err?.message ?? "Sign in failed");
      setRemaining(
        typeof err?.body.attemptsRemaining === "number"
          ? err.body.attemptsRemaining
          : null,
      );
      setLockedFor(
        typeof err?.body.retryAfter === "number" ? err.body.retryAfter : null,
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-card border border-rule bg-paper-2 p-6 shadow-card"
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h1 className="flex justify-center">
            <Wordmark />
          </h1>
          <p className="text-sm text-ink-2">Sign in to manage this instance.</p>
        </div>

        <div className="space-y-3">
          <Field label="Username">
            {(props) => (
              <Input
                {...props}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                size="lg"
                autoFocus
              />
            )}
          </Field>

          <Field label="Password">
            {(props) => (
              <PasswordInput
                {...props}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                size="lg"
              />
            )}
          </Field>
        </div>

        {error && (
          <p className="mt-3 text-sm text-danger">
            {error}
            {lockedFor !== null && lockedFor > 0 && (
              <> Try again in {Math.ceil(lockedFor / 60)} min.</>
            )}
            {lockedFor === null && remaining !== null && remaining <= 3 && (
              <> {remaining} attempt{remaining === 1 ? "" : "s"} left.</>
            )}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading || !username.trim() || !password}
          className="mt-4 w-full"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <p className="mt-4 text-center text-xs text-ink-2">
          First run? The credentials were printed in the API logs on boot.
        </p>
      </form>
    </div>
  );
}
