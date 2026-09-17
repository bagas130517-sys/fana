"use client";

import { ArrowLeft, ExternalLink, Paperclip, Trash2 } from "lucide-react";
import type { Message } from "@fana/core";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { AuthBadge } from "./AuthBadge";
import { Button } from "./ui/Button";
import { CopyButton } from "./ui/CopyButton";

interface Props {
  message: Message;
  onBack: () => void;
  onDelete: (id: string) => void;
  /** Spacing is the caller's call — the inbox stacks it, the inspector aligns it. */
  className?: string;
}

// Wrap sanitized email HTML in a minimal document for the sandboxed iframe.
function wrapEmailHtml(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:16px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;color:#18181b;word-break:break-word}img{max-width:100%;height:auto}a{color:#4f46e5}</style></head><body>${html}</body></html>`;
}

/** Host + a little path: enough to judge a link, short enough to sit in a chip. */
function linkLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    return pathname.length > 1 ? `${host}${pathname}` : host;
  } catch {
    return url;
  }
}

export function MessageView({ message, onBack, onDelete, className }: Props) {
  // The API extracts on a single-message read, so these are absent in listings
  // — which is fine, this component only ever renders an opened message.
  const code = message.extracted?.codes[0];
  const link = message.extracted?.links[0];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-rule bg-paper-2 shadow-card",
        className,
      )}
    >
      <header className="border-b border-rule p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
            Inbox
          </Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(message.id)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
        <h2 className="text-lg font-bold" style={{ overflowWrap: "anywhere" }}>
          {message.subject || "(no subject)"}
        </h2>
        <p className="mt-1.5 flex items-center gap-2 text-sm">
          <AuthBadge auth={message.auth} />
          <span className="truncate text-ink-2">
            {message.fromName ? `${message.fromName} · ` : ""}
            {message.fromAddress}
          </span>
        </p>

        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-xs">
          <dt className="text-ink-2">To</dt>
          <dd className="truncate font-mono text-ink">{message.mailbox}</dd>
          <dt className="text-ink-2">Received</dt>
          <dd className="text-ink">
            {new Date(message.receivedAt).toLocaleString()}
          </dd>
          <dt className="text-ink-2">Security</dt>
          <dd className="text-ink">
            SPF {message.auth.spf ?? "none"} · DKIM {message.auth.dkim ?? "none"} ·
            DMARC {message.auth.dmarc ?? "none"}
          </dd>
        </dl>
      </header>

      {/*
        The reason most people opened this message, lifted above the body so it
        can be copied without hunting through a marketing template. Only the
        best guess is shown — the rest of the body is right underneath if it's
        wrong. The primary link is a plain anchor, so what it points at is
        visible on hover before it's clicked.
      */}
      {(code || link) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-rule bg-accent-soft/40 p-3">
          {code && (
            <>
              <span className="text-xs font-medium text-ink-2">Code</span>
              <code className="rounded-md border border-rule bg-paper px-2.5 py-1 font-mono text-base font-bold tracking-wider">
                {code}
              </code>
              <CopyButton value={code} toastMessage="Code copied" />
            </>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="ml-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-rule bg-paper px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-paper-3"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{linkLabel(link)}</span>
            </a>
          )}
        </div>
      )}

      {message.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-rule p-3">
          {message.attachments.map((a) => (
            <a
              key={a.id}
              href={api.attachmentUrl(message.id, a.id)}
              download={a.filename}
              className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-paper px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-paper-3"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {a.filename} ({Math.ceil(a.size / 1024)} KB)
            </a>
          ))}
        </div>
      )}

      {message.html ? (
        <iframe
          title="Email content"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={wrapEmailHtml(message.html)}
          className="h-[70vh] w-full border-0 bg-white"
        />
      ) : (
        <div className="max-h-[70vh] overflow-auto p-4 sm:p-5">
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink">
            {message.text}
          </pre>
        </div>
      )}
    </section>
  );
}
