"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

/**
 * Hover/focus tooltip. Radix handles the delay, the escape hatch and touch
 * behaviour; the trigger must be focusable for the content to be reachable
 * without a mouse.
 */
export function Tooltip({
  content,
  children,
  className,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className={cn(
              "anim-pop z-50 max-w-xs rounded-md border border-rule bg-paper-2 px-2.5 py-1.5 text-xs text-ink shadow-card",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-paper-2" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
