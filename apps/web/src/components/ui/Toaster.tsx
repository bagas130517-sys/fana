"use client";

import { Toaster as Sonner, toast } from "sonner";

export { toast };

/**
 * Sonner wearing our tokens. It ships its own theme variables; we override the
 * rendered classes instead so a toast looks like the rest of the app in both
 * colour schemes without importing a second design system.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-2.5 rounded-md border border-rule bg-paper-2 p-3 text-sm text-ink shadow-card",
          title: "font-medium",
          description: "text-ink-2",
          actionButton:
            "ml-auto rounded-sm bg-accent px-2 py-1 text-xs font-medium text-accent-ink",
          closeButton: "text-ink-2 hover:text-ink",
          icon: "shrink-0",
          success: "[&_[data-icon]]:text-good",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warn",
        },
      }}
    />
  );
}
