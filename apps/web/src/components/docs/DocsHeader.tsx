import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { AccountLink } from "@/components/AccountLink";
import { RepoLink } from "@/components/RepoLink";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Docs sit outside the inbox app, so they carry their own way back to it.
 *
 * Above the code blocks in the stacking order — a copy button pinned inside a
 * sample would otherwise ride over this on scroll.
 */
export function DocsHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink"
          >
            Inbox
          </Link>
          <AccountLink className="rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink" />
          <RepoLink />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
