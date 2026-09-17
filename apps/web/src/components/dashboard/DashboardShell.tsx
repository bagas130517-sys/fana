"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { adminApi, getToken, setSignedOutHandler, setToken } from "@/lib/adminApi";
import { accountApi } from "@/lib/accountApi";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RefreshProvider } from "@/components/admin/RefreshContext";
import { RoleProvider } from "./RoleContext";

export interface NavItem {
  key: string;
  /** Appended to basePath; "" is the root. */
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The chrome both dashboards wear: auth gate, sidebar, header, refresh, account
 * menu. Operators and customers get the same shell and differ only in the nav
 * they're handed and what renders inside — one layout to maintain, and the
 * customer area can grow past a single page without a second implementation.
 */
export function DashboardShell({
  basePath,
  section,
  nav,
  signInHref,
  fallback,
  children,
}: {
  /** Public root of this area. */
  basePath: string;
  section: string;
  /** Navigation for the signed-in role — operators see more entries. */
  nav: (role: string) => NavItem[];
  /** Accent-coloured word after the site name, e.g. ".admin". */
  /** Where an unauthenticated visitor is sent. Omit to render `fallback`. */
  signInHref?: string;
  /** Sign-in UI rendered in place — the operator's password form. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // A stored token may be expired or revoked, so confirm it with the API rather
  // than trusting its presence. An OAuth callback may also have just left one
  // in the fragment.
  useEffect(() => {
    const fromCallback = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fromCallback) {
      setToken(fromCallback);
      history.replaceState(null, "", window.location.pathname);
    }

    if (!getToken()) {
      setAuthed(false);
      return;
    }
    // /api/account, not /api/admin/session: this shell also carries customers,
    // and the admin route answers 403 for them.
    accountApi
      .me()
      .then(({ user }) => {
        setUsername(user.username);
        setRole(user.role);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));
  }, []);

  // Any request that hits an expired session drops back to signed-out.
  useEffect(() => {
    setSignedOutHandler(() => {
      setAuthed(false);
      setUsername(null);
    });
    return () => setSignedOutHandler(undefined);
  }, []);

  // Customers sign in on their own page; operators sign in where they stand.
  useEffect(() => {
    if (authed === false && signInHref) router.replace(signInHref);
  }, [authed, signInHref, router]);

  if (authed === null || (authed === false && signInHref)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-ink">
        <Loader2 className="h-6 w-6 animate-spin text-ink-2" />
      </div>
    );
  }
  if (!authed) return <>{fallback}</>;

  const items = nav(role ?? "customer").map((n) => ({
    ...n,
    url: `${basePath}${n.href}`,
  }));
  const active = items.find((n) => n.key === section) ?? items[0]!;

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-rule p-3 md:flex">
        <Wordmark href={basePath} className="px-2 py-2" />
        <nav className="mt-3 flex flex-col gap-0.5">
          {items.map((n) => (
            <Link
              key={n.key}
              href={n.url}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                n.key === active.key
                  ? "bg-accent-soft text-accent"
                  : "text-ink-2 hover:bg-paper-3 hover:text-ink"
              }`}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Outside the registry: the reference is a page of the site, not a
            dashboard section, so it has no `basePath` and never goes active. */}
        <Link
          href="/docs"
          className="mt-auto flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
        >
          <BookOpen className="h-4 w-4" />
          API docs
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-rule bg-paper">
          <div className="flex items-center justify-between px-4 py-3">
            <h1 className="text-lg font-bold">{active.label}</h1>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setRefreshKey((k) => k + 1)}
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <span className="max-w-[10rem] truncate">{username ?? "Account"}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>
                    Signed in as {username}
                    {role === "admin" && basePath === "/dashboard" && " (operator)"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/">
                      <Inbox className="h-4 w-4" />
                      Open the inbox app
                    </Link>
                  </DropdownMenuItem>
                  {basePath !== "/dashboard" && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard">
                        <KeyRound className="h-4 w-4" />
                        API dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    danger
                    onSelect={() => {
                      void adminApi.logout().finally(() => {
                        setAuthed(false);
                        setUsername(null);
                        if (signInHref) router.replace(signInHref);
                      });
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-rule px-3 py-2 md:hidden">
            {items.map((n) => (
              <Link
                key={n.key}
                href={n.url}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  n.key === active.key ? "bg-accent-soft text-accent" : "text-ink-2"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            ))}
            <Link
              href="/docs"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-2 transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              API docs
            </Link>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          <RoleProvider value={role ?? "customer"}>
            <RefreshProvider value={refreshKey}>{children}</RefreshProvider>
          </RoleProvider>
        </main>
      </div>
    </div>
  );
}
