"use client";

import { createContext, useContext } from "react";

/**
 * The header's refresh button bumps a counter; every section re-fetches when it
 * changes. A context rather than a prop because the shell and the pages are now
 * separate routes.
 */
const RefreshContext = createContext(0);

export function RefreshProvider({
  value,
  children,
}: {
  value: number;
  children: React.ReactNode;
}) {
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefreshKey(): number {
  return useContext(RefreshContext);
}
