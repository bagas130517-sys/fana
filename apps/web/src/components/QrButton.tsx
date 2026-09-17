"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "./ui/Button";

/** A QR code of the shareable inbox URL — scan to open the inbox on another device. */
export function QrButton({ address }: { address: string | null }) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [url, setUrl] = useState("");

  // window is not there during the server render, so the URL is built on mount.
  useEffect(() => {
    setUrl(address ? `${window.location.origin}/${address}` : "");
  }, [address]);

  useEffect(() => {
    if (!open || !url) return;
    QRCode.toDataURL(url, { margin: 1, width: 220 })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [open, url]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="outline" size="icon" disabled={!address} aria-label="Show QR code">
          <QrCode className="h-4 w-4" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="anim-pop z-50 w-[232px] rounded-card border border-rule bg-paper-2 p-3 text-ink shadow-card"
        >
          {src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={src} alt="Inbox QR code" width={208} height={208} className="h-52 w-52 rounded-md" />
          ) : (
            <div className="h-52 w-52 animate-pulse rounded-md bg-paper-3" />
          )}
          <p className="mt-2 break-all text-center text-[11px] text-ink-2">{url}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
