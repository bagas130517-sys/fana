"use client";

import { createContext, useContext } from "react";
import { DEFAULT_BRAND, type Brand } from "@fana/core/brand";

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

/** Makes the server-resolved brand available to client components. */
export function BrandProvider({
  brand,
  children,
}: {
  brand: Brand;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  return useContext(BrandContext);
}
