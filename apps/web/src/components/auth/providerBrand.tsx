import { LogIn } from "lucide-react";
import { GithubMark } from "@/components/icons/GithubMark";

/**
 * How a sign-in provider is allowed to look.
 *
 * Kept on the web side rather than in `auth/providers.ts`: which providers an
 * instance offers is API data, but a logo is markup and the API has no reason
 * to ship SVG paths. Only the providers actually in the registry get an entry —
 * anything else falls back to a plain button in our own colours, so adding
 * Google to the API works before anyone draws its mark here.
 *
 * This is the one place `dark:` variants are right. Everywhere else colours are
 * CSS variables that swap under `.dark` (see tailwind.config.ts), but a brand
 * colour is fixed — GitHub's black cannot become the operator's accent. What
 * changes between themes is which of the *provider's own* approved treatments
 * to use, because a near-black button on a near-black page can't be read.
 */

export interface ProviderBrand {
  /** Colours only — sizing, focus and disabled state stay with `Button`. */
  className: string;
  icon: React.ReactNode;
}

const github: ProviderBrand = {
  className:
    "border-transparent bg-[#24292f] text-white hover:bg-[#32383f] dark:bg-white dark:text-[#24292f] dark:hover:bg-[#e6e6e6]",
  icon: <GithubMark />,
};

const BRANDS: Record<string, ProviderBrand> = { github };

/** A provider we have no mark for: our own tokens, a neutral icon. */
const FALLBACK: ProviderBrand = {
  className: "border-rule bg-paper text-ink hover:bg-paper-3",
  icon: <LogIn className="h-[18px] w-[18px]" aria-hidden />,
};

export const providerBrand = (id: string): ProviderBrand =>
  BRANDS[id.toLowerCase()] ?? FALLBACK;
