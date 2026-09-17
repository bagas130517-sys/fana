"use client";

import { createContext, useContext } from "react";

/**
 * The signed-in role, resolved once by the shell. Sections read it to decide
 * whether they exist for this visitor at all — the API enforces the same rule,
 * this only avoids rendering a page that would answer 403.
 */
const RoleContext = createContext("customer");

export function RoleProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): string {
  return useContext(RoleContext);
}
