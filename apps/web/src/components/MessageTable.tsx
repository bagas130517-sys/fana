"use client";

import { CheckCheck, Inbox, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { Message } from "@fana/core";
import { AuthBadge } from "./AuthBadge";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

interface Props {
  messages: Message[];
  loading: boolean;
  onOpen: (m: Message) => void;
  onMarkAllRead: () => void;
  onPurge: () => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MessageTable({
  messages,
  loading,
  onOpen,
  onMarkAllRead,
  onPurge,
}: Props) {
  const unread = messages.filter((m) => !m.seen).length;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Inbox
          {unread > 0 && <Badge tone="accent">{unread} new</Badge>}
        </h3>
        {messages.length > 0 && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              Mark read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onPurge}
              className="hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-rule bg-paper-2 shadow-card">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin text-ink-2" />
            ) : (
              <Inbox className="h-8 w-8 text-ink-2" strokeWidth={1.5} />
            )}
            <p className="text-sm font-medium">
              {loading ? "Loading…" : "No emails yet"}
            </p>
            {!loading && (
              <p className="max-w-xs text-xs text-ink-2">
                Send a message to your address — it shows up here instantly, no
                refresh needed.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onOpen(m)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-paper-3"
                >
                  <span
                    className={`mt-1.5 block h-2 w-2 shrink-0 rounded-full ${m.seen ? "" : "bg-accent"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${m.seen ? "text-ink-2" : "font-semibold text-ink"}`}
                      >
                        {m.fromName || m.fromAddress}
                      </span>
                      <span className="shrink-0 text-xs text-ink-2">
                        {fmtTime(m.receivedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={`truncate text-sm ${m.seen ? "text-ink-2" : "text-ink"}`}
                      >
                        {m.subject || "(no subject)"}
                      </span>
                      {m.attachments.length > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-ink-2">
                          <Paperclip className="h-3 w-3" />
                          {m.attachments.length}
                        </span>
                      )}
                      <AuthBadge auth={m.auth} compact />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
