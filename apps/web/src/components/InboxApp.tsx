"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import type { Message } from "@fana/core";
import { REPO_URL } from "@fana/core/brand";
import { useInbox } from "@/lib/useInbox";
import { useBrand } from "@/components/BrandProvider";
import { Wordmark } from "@/components/Wordmark";
import { AccountLink } from "@/components/AccountLink";
import { Toolbar } from "@/components/Toolbar";
import { MessageTable } from "@/components/MessageTable";
import { MessageView } from "@/components/MessageView";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AddDomainDialog } from "@/components/AddDomainDialog";
import { Button } from "@/components/ui/Button";

export function InboxApp({ slug }: { slug: string[] }) {
  const inbox = useInbox(slug);
  const brand = useBrand();
  const [active, setActive] = useState<Message | null>(null);
  const [addingDomain, setAddingDomain] = useState(false);

  const open = useCallback(
    async (m: Message) => {
      // Push a history entry so the browser Back button returns to the inbox.
      window.history.pushState(null, "", `/${inbox.address}?msg=${m.id}`);
      setActive(m); // show instantly with list data
      const full = await inbox.openMessage(m.id); // fetch body + mark seen
      if (full) setActive((cur) => (cur?.id === full.id ? full : cur));
    },
    [inbox],
  );

  const back = useCallback(() => window.history.back(), []);

  // Sync the open message with browser navigation (back/forward).
  useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("msg");
      setActive(id ? (inbox.messages.find((m) => m.id === id) ?? null) : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [inbox.messages]);

  // Leaving the mailbox (new/custom address) closes any open message.
  useEffect(() => {
    setActive(null);
  }, [inbox.address]);

  function handleDelete(id: string) {
    void inbox.deleteMessage(id);
    if (active?.id === id) back();
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          {/* Home link — the wordmark is the way back to a fresh inbox. */}
          <h1>
            <Wordmark />
          </h1>
          <div className="flex items-center gap-1">
            {/* The people using this inbox to receive a signup email are the
                people the API is for, so the way to it lives here rather than
                only on a page nobody has a reason to look for. */}
            <Link
              href="/docs"
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
            >
              API
            </Link>
            {/* Only once there is a session: the inbox works without an account,
                so an anonymous visitor has nothing to sign in for here. */}
            <AccountLink
              onlyWhenSignedIn
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingDomain(true)}
              className="hidden sm:inline-flex"
            >
              <Globe className="h-4 w-4" />
              Add domain
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAddingDomain(true)}
              aria-label="Add your domain"
              className="h-9 w-9 sm:hidden"
            >
              <Globe className="h-4 w-4" />
            </Button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source repository"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <p className="mb-4 px-1 text-sm text-ink-2">{brand.tagline}</p>

        <Toolbar
          address={inbox.address}
          domains={inbox.domains}
          domainDetails={inbox.domainDetails}
          connected={inbox.connected}
          onApply={inbox.useAddress}
          onGenerate={() => void inbox.regenerate()}
          onRefresh={inbox.refresh}
        />

        {active ? (
          <MessageView
            message={active}
            onBack={back}
            onDelete={handleDelete}
            className="mt-6"
          />
        ) : (
          <MessageTable
            messages={inbox.messages}
            loading={inbox.loading}
            onOpen={open}
            onMarkAllRead={() => void inbox.markAllRead()}
            onPurge={() => void inbox.purge()}
          />
        )}

        <footer className="mt-12 text-center text-xs text-ink-2">
          Anyone who knows the address can read it — don&apos;t use it for
          anything private.
        </footer>
      </main>

      {addingDomain && (
        <AddDomainDialog
          onClose={() => setAddingDomain(false)}
          onVerified={() => void inbox.refreshDomains()}
        />
      )}
    </div>
  );
}

