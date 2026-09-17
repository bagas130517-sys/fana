"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "./Button";
import { toast } from "./Toaster";

/**
 * Copy-to-clipboard with the confirmation built in: the icon flips to a tick
 * for a beat so the click always answers back. One implementation, so every
 * copy in the app behaves identically.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  toastMessage,
  variant = "outline",
  size,
  className,
  ...props
}: Omit<ButtonProps, "value" | "children"> & {
  value: string;
  /** Text next to the icon. Omit for an icon-only button. */
  label?: string;
  copiedLabel?: string;
  /** Also raise a toast — for copies that happen away from the button. */
  toastMessage?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) toast.success(toastMessage);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access is denied outside a secure context (plain-http host).
      toast.error("Couldn't copy — copy it manually.");
    }
  }

  return (
    <Button
      variant={variant}
      size={size ?? (label ? "md" : "icon")}
      onClick={() => void copy()}
      aria-label={label ? undefined : copied ? copiedLabel : "Copy"}
      className={className}
      {...props}
    >
      {copied ? (
        <Check className="h-4 w-4 text-good" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {label && (copied ? copiedLabel : label)}
    </Button>
  );
}
