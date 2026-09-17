import { cn } from "@/lib/cn";

/** Loading placeholder. Pulse is disabled under prefers-reduced-motion (globals.css). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-paper-3", className)}
      {...props}
    />
  );
}

/** Stacked bars for list/table placeholders. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
