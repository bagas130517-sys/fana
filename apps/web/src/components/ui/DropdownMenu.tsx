"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/cn";

/** Radix DropdownMenu on our tokens. Exit animation included, unlike a hand-rolled popover. */

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  align = "end",
  children,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  children: React.ReactNode;
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "anim-pop z-50 min-w-[10rem] overflow-hidden rounded-md border border-rule bg-paper-2 p-1 text-ink shadow-card",
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
  danger?: boolean;
}) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-paper-3",
        danger && "text-danger data-[highlighted]:bg-danger-soft",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn("px-2.5 py-1.5 text-xs text-ink-2", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-rule" />;
}
