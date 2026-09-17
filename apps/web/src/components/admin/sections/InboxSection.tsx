"use client";

import { useState } from "react";
import { Inbox, Lock, Search, X } from "lucide-react";
import type { Message } from "@fana/core";
import { adminApi } from "@/lib/adminApi";
import { api } from "@/lib/api";
import { useAdminResource } from "@/lib/useAdminResource";
import { useRefreshKey } from "../RefreshContext";
import { Panel } from "../Panel";
import { AuthBadge } from "@/components/AuthBadge";
import { Badge } from "@/components/ui/Badge";
import { MessageView } from "@/components/MessageView";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Pager } from "@/components/ui/Pager";

function fmtTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function InboxSection() {
  const refreshKey = useRefreshKey();
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Message | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAdminResource(
    () => adminApi.messages(query || undefined, page),
    `${refreshKey}:${query}:${page}`,
  );

  async function open(id: string) {
    setOpening(id);
    const full = await api.message(id).catch(() => null);
    setOpening(null);
    if (full) setActive(full);
  }

  async function del(id: string) {
    await api.deleteMessage(id);
    setActive(null);
    await reload();
  }

  const messages = data?.messages ?? [];

  return (
    // List and reader side by side once there's room; on narrow screens the
    // reader sits under the list rather than replacing it, so you never lose
    // your place in the inspector.
    <div className={active ? "grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" : ""}>
      <Panel title="Inbox inspector" icon={<Inbox className="h-4 w-4 text-accent" />}>
        <div className="mb-3 flex items-center gap-2 rounded-md border border-rule bg-paper px-3 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
          <Search className="h-4 w-4 shrink-0 text-ink-2" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            // A new filter starts at page 1: page 7 of the previous one means
            // nothing, and often does not exist.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setQuery(filter.trim().toLowerCase());
                setPage(1);
              }
            }}
            onBlur={() => {
              setQuery(filter.trim().toLowerCase());
              setPage(1);
            }}
            placeholder="Filter by mailbox — Enter to apply"
            aria-label="Filter by mailbox"
            className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-sm outline-none"
          />
        </div>

        {error && <p className="mb-3 text-sm text-danger">{error}</p>}

        {loading ? (
          <SkeletonRows rows={5} />
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-2">
            {query ? `No messages for ${query}.` : "No messages."}
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => void open(m.id)}
                  // Mail for a customer's private inbox is listed so an operator
                  // can see the instance is working, and not opened: reading it
                  // needs the owner's key, and the reader here has none.
                  disabled={m.private}
                  title={m.private ? "Private inbox — body not readable here" : undefined}
                  aria-current={active?.id === m.id}
                  className={`flex w-full items-start gap-3 rounded-sm px-2 py-3 text-left transition-colors ${
                    active?.id === m.id ? "bg-accent-soft" : "hover:bg-paper-3"
                  } ${opening === m.id ? "opacity-60" : ""} ${
                    m.private ? "cursor-not-allowed" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-accent">
                        {m.mailbox}
                      </span>
                      <span className="shrink-0 text-xs text-ink-2">
                        {fmtTime(m.receivedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${m.seen ? "text-ink-2" : "font-medium"}`}
                      >
                        {m.fromName || m.fromAddress} — {m.subject || "(no subject)"}
                      </span>
                      <AuthBadge
                        auth={{ spf: null, dkim: null, dmarc: null, verdict: m.verdict }}
                        compact
                      />
                      {m.private && (
                        <Badge tone="accent" title="Private inbox — API customer's mail">
                          <Lock className="h-3 w-3" />
                          private
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pager
          info={data ?? undefined}
          busy={opening !== null}
          shown={messages.length}
          onPage={setPage}
        />
      </Panel>

      {active && (
        <div className="min-w-0">
          <div className="mb-2 flex justify-end lg:hidden">
            <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
          <MessageView
            message={active}
            onBack={() => setActive(null)}
            onDelete={del}
          />
        </div>
      )}
    </div>
  );
}
