"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Radix Dialog wearing our tokens — focus trap, scroll lock, Escape and
 * aria-modal come from the primitive; every colour, radius and shadow is ours.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  icon,
  description,
  className,
  children,
  footer,
}: {
  title: string;
  icon?: React.ReactNode;
  /** Announced with the dialog; omit when the body already explains itself. */
  description?: string;
  className?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "anim-dialog fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-card border border-rule bg-paper-2 text-ink shadow-card focus:outline-none",
          className,
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-rule p-4">
          <DialogPrimitive.Title className="flex items-center gap-2 font-bold">
            {icon}
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </header>

        {description ? (
          <DialogPrimitive.Description className="px-4 pt-4 text-sm text-ink-2">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">
            {title}
          </DialogPrimitive.Description>
        )}

        <div className="p-4">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-rule bg-paper p-4">
            {footer}
          </footer>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
