import { ShieldCheck, ShieldAlert, ShieldQuestion, type LucideIcon } from "lucide-react";
import type { Message } from "@fana/core";
import { Badge, type BadgeProps } from "./ui/Badge";

const MAP: Record<
  Message["auth"]["verdict"],
  { tone: NonNullable<BadgeProps["tone"]>; Icon: LucideIcon; label: string }
> = {
  verified: { tone: "good", Icon: ShieldCheck, label: "Verified" },
  unverified: { tone: "neutral", Icon: ShieldQuestion, label: "Unverified" },
  suspicious: { tone: "warn", Icon: ShieldAlert, label: "Suspicious" },
};

export function AuthBadge({
  auth,
  compact = false,
}: {
  auth: Message["auth"];
  compact?: boolean;
}) {
  const { tone, Icon, label } = MAP[auth.verdict];
  const title = `Sender auth — SPF: ${auth.spf ?? "none"} · DKIM: ${auth.dkim ?? "none"} · DMARC: ${auth.dmarc ?? "none"}`;
  return (
    <Badge tone={tone} title={title}>
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </Badge>
  );
}
