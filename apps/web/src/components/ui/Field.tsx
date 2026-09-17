"use client";

import { useId } from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/cn";

/**
 * Label + control + hint/error, wired together by id so the hint is announced
 * with the control. Takes a render prop because the control can be an Input, a
 * Textarea or something custom (the colour picker).
 */
export function Field({
  label,
  hint,
  error,
  action,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  /** Optional control rendered next to the label, e.g. a "use default" link. */
  action?: React.ReactNode;
  className?: string;
  children: (props: { id: string; "aria-describedby": string }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = `${id}-hint`;

  return (
    <div className={cn("block", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <LabelPrimitive.Root
          htmlFor={id}
          className="text-xs font-medium text-ink-2"
        >
          {label}
        </LabelPrimitive.Root>
        {action}
      </div>
      {children({ id, "aria-describedby": describedBy })}
      {(error ?? hint) && (
        <p
          id={describedBy}
          className={cn("mt-1 text-xs", error ? "text-danger" : "text-ink-2")}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
