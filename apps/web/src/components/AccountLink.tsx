"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/adminApi";

/**
 * Sends you where you actually need to go: sign-in when there's no session,
 * the dashboard when there is. The session lives in localStorage, so this can
 * only be answered in the browser — the page itself is server-rendered and has
 * no idea who is reading it.
 *
 * Renders the signed-out label first and swaps after mount rather than
 * rendering nothing: the header must not reflow, and a signed-out visitor (the
 * common case on a docs page) sees the right thing immediately.
 */
export function AccountLink({
  className,
  signedOutLabel = "Sign in",
  signedInLabel = "Dashboard",
  onlyWhenSignedIn = false,
  children,
}: {
  className?: string;
  signedOutLabel?: string;
  signedInLabel?: string;
  /**
   * Render nothing until there is a session. For the public inbox, where an
   * anonymous visitor has no reason to be asked to sign in — the tool works
   * without an account, and the way in is the API link next to it.
   */
  onlyWhenSignedIn?: boolean;
  /**
   * Rendered after the label — an arrow, say. An element rather than a render
   * prop: a function cannot cross the boundary from the server component that
   * uses this.
   */
  children?: React.ReactNode;
}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    try {
      setSignedIn(getToken() !== null);
    } catch {
      // Storage can be blocked entirely; signed-out is the safe assumption.
    }
  }, []);

  if (onlyWhenSignedIn && !signedIn) return null;

  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={className}>
      {signedIn ? signedInLabel : signedOutLabel}
      {children}
    </Link>
  );
}
