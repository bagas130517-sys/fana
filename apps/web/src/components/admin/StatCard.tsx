import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-card border border-rule bg-paper-2 p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-ink-2">{label}</p>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}
