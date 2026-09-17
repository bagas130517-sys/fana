import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badge = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-sm font-semibold leading-none",
  {
    variants: {
      tone: {
        good: "bg-good-soft text-good",
        warn: "bg-warn-soft text-warn",
        neutral: "bg-paper-3 text-ink-2",
        accent: "bg-accent-soft text-accent",
        danger: "bg-danger-soft text-danger",
      },
      size: {
        sm: "px-1.5 py-1 text-[11px]",
        md: "px-2 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badge>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
