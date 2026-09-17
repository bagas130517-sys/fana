"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

/** Radix Switch styled with our accent tokens. */
export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-rule transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=unchecked]:bg-paper-3",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-paper-2 transition-transform data-[state=checked]:translate-x-[1.125rem]" />
    </SwitchPrimitive.Root>
  );
}

/** Switch with its label, the shape every toggle in the dashboard needs. */
export function SwitchField({
  label,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  label: string;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-xs text-ink-2", className)}>
      <Switch {...props} />
      {label}
    </label>
  );
}
