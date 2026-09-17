"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

/**
 * Page controls for a server-paged list.
 *
 * Separate from `DataTable` because not every long list is a table — the
 * customer list expands rows to show each account's keys — and the pager is the
 * part that has to behave identically everywhere regardless.
 */

export interface PageInfo {
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

export function Pager({
  info,
  onPage,
  busy,
  /** Rows on screen, when it differs from `perPage` — the last page is short. */
  shown,
}: {
  info: PageInfo | undefined;
  onPage: (next: number) => void;
  busy?: boolean;
  shown?: number;
}) {
  // One page is not worth a control that says so.
  if (!info || info.pages <= 1) return null;

  const from = (info.page - 1) * info.perPage + 1;
  const to = from + (shown ?? info.perPage) - 1;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-2">
      <span>
        {from.toLocaleString()}–{Math.min(to, info.total).toLocaleString()} of{" "}
        {info.total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || info.page <= 1}
          onClick={() => onPage(info.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-1">
          {info.page} / {info.pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || info.page >= info.pages}
          onClick={() => onPage(info.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
