"use client";

import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";

/**
 * The site name, styled name + accented TLD ("fana" + ".email").
 *
 * Always the operator's actual `siteName`. The dashboard used to append its own
 * suffix — "fana" + ".api" — which read as a second product on a domain nobody
 * owns, and left the name in three places to get wrong.
 *
 * A link when `href` is given, plain text otherwise: a sign-in card shows the
 * name without pretending to be navigation.
 */
export function Wordmark({
  href,
  className,
}: {
  href?: string;
  className?: string;
}) {
  const brand = useBrand();
  // The accent lands on the TLD — "fana" + ".email". A one-word name has no TLD
  // to colour, so it takes the accent whole rather than losing it: the brand
  // colour is the identity, and a name without a dot is a normal thing to set.
  const [head, ...tail] = brand.siteName.split(".");
  const hasTld = tail.length > 0;

  const inner = (
    <>
      {brand.logoUrl && (
        // Self-hosted logo: any URL, any aspect — box it to a fixed size.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-7 w-7 rounded-md object-contain" />
      )}
      <span className="text-lg font-extrabold tracking-tight">
        <span className={hasTld ? undefined : "text-accent"}>{head}</span>
        {hasTld && <span className="text-accent">.{tail.join(".")}</span>}
      </span>
    </>
  );

  if (!href) {
    return <span className={`flex items-center gap-2 ${className ?? ""}`}>{inner}</span>;
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft ${className ?? ""}`}
    >
      {inner}
    </Link>
  );
}
