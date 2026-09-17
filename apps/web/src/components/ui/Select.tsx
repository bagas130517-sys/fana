"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Radix Select styled with our tokens. Replaces the hand-rolled dropdown:
 * typeahead, arrow keys, collision-aware positioning and focus return come
 * from the primitive.
 */
export function Select({
  value,
  onValueChange,
  items,
  ariaLabel,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: string[];
  ariaLabel: string;
  triggerClassName?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex items-center gap-1 rounded-md py-1 pl-1 pr-2 text-ink outline-none transition-colors hover:text-accent focus-visible:ring-4 focus-visible:ring-accent-soft",
          triggerClassName,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-ink-2" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="anim-pop z-50 max-h-64 min-w-[190px] overflow-hidden rounded-md border border-rule bg-paper-2 p-1 text-ink shadow-card"
        >
          <SelectPrimitive.Viewport>
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item}
                value={item}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 font-mono text-sm outline-none data-[highlighted]:bg-paper-3 data-[state=checked]:text-accent"
              >
                <SelectPrimitive.ItemText>{item}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
