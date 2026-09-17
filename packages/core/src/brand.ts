/**
 * White-label branding. Values come from three layers, highest first:
 * overrides saved from `/admin` (stored in the DB) → `SITE_NAME` from env →
 * the built-in fana theme below. Nothing is baked into the web build, so an
 * operator rebrands a prebuilt image from the dashboard — no rebuild, no
 * redeploy.
 *
 * A theme is one accent colour; every other accent token (hover, tint, text-on-
 * accent) is derived in OKLCH so light and dark stay balanced. The defaults here
 * reproduce the tokens shipped in `apps/web/src/app/globals.css` exactly.
 */

import { z } from "zod";

export type Oklch = { l: number; c: number; h: number };

/** Default accent — keep in sync with the `:root` fallback in globals.css. */
export const DEFAULT_ACCENT: Oklch = { l: 0.56, c: 0.17, h: 274 };

/**
 * Attribution link in the header. Hardcoded on purpose: the upstream project
 * keeps its credit no matter how an instance is themed, so this is deliberately
 * not part of {@link BrandOverrides}.
 */
export const REPO_URL = "https://github.com/JastinXyz/fana";

export type Brand = {
  siteName: string;
  tagline: string;
  /** Empty string means the wordmark stands alone — no placeholder glyph. */
  logoUrl: string;
  /** Empty string falls back to the built-in favicon. */
  faviconUrl: string;
  accent: Oklch;
  accentDark: Oklch;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

// ---------------------------------------------------------------------------
// Colour parsing
// ---------------------------------------------------------------------------

/**
 * Parse an operator-supplied accent colour. Accepts `#rgb`, `#rrggbb` and
 * `oklch(L C H)` (L as `56%` or `0.56`). Returns null for anything else —
 * values are re-emitted numerically, so nothing operator-supplied reaches CSS.
 */
export function parseColor(input: string | undefined | null): Oklch | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1];
  if (hex) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const channel = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
    return srgbToOklch(channel(0), channel(2), channel(4));
  }

  const ok =
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i.exec(raw);
  if (ok) {
    const l = Number(ok[1]) / (ok[2] === "%" ? 100 : 1);
    const c = Number(ok[3]);
    const h = Number(ok[4]);
    if (![l, c, h].every(Number.isFinite)) return null;
    return { l: clamp(l, 0, 1), c: clamp(c, 0, 0.5), h: ((h % 360) + 360) % 360 };
  }

  return null;
}

/** sRGB (0..1 per channel) → OKLCH, via Björn Ottosson's OKLab transform. */
export function srgbToOklch(r: number, g: number, b: number): Oklch {
  const lin = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [R, G, B] = [lin(r), lin(g), lin(b)];

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const c = Math.hypot(a, bb);
  const h = c < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: clamp(L, 0, 1), c, h };
}

/**
 * OKLCH → `#rrggbb`, the inverse of {@link srgbToOklch}.
 *
 * CSS is the natural home for these colours and takes `oklch()` directly, so
 * this exists for the places that can't: the OG image renderer understands only
 * plain sRGB, and anything else generated outside a browser will be the same.
 *
 * Out-of-gamut values are clipped per channel rather than gamut-mapped. A
 * clipped accent shifts slightly; the alternative is a chroma search for a
 * colour nobody is comparing side by side with the CSS one.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const R = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const G = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const B = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  const gamma = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  const channel = (v: number) =>
    Math.round(clamp(gamma(v), 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(R)}${channel(G)}${channel(B)}`;
}

/** Serialize for CSS. Rounded so the emitted stylesheet stays readable. */
export function formatOklch({ l, c, h }: Oklch): string {
  const round = (n: number, d: number) => Number(n.toFixed(d));
  return `oklch(${round(l * 100, 1)}% ${round(c, 3)} ${round(h, 1)})`;
}

// ---------------------------------------------------------------------------
// Token derivation
// ---------------------------------------------------------------------------

/**
 * Dark-mode accent for a light-mode accent: lift lightness (dark surfaces need
 * a brighter accent to stay legible) and cap chroma so it doesn't glow.
 */
export function deriveDarkAccent(accent: Oklch): Oklch {
  return { l: 0.74, c: Math.min(accent.c, 0.14), h: accent.h };
}

/** Text colour that stays legible on top of `accent`. */
function inkOn(accent: Oklch): Oklch {
  return accent.l > 0.7
    ? { l: 0.17, c: 0.02, h: accent.h }
    : { l: 0.99, c: 0, h: 0 };
}

export type AccentTokens = {
  "--color-accent": string;
  "--color-accent-strong": string;
  "--color-accent-soft": string;
  "--color-accent-ink": string;
};

/** The four accent CSS vars for a light-mode surface. */
export function lightAccentTokens(accent: Oklch): AccentTokens {
  return {
    "--color-accent": formatOklch(accent),
    "--color-accent-strong": formatOklch({
      ...accent,
      l: clamp(accent.l - 0.06, 0.15, 0.95),
      c: Math.min(accent.c + 0.02, 0.37),
    }),
    "--color-accent-soft": formatOklch({
      l: 0.95,
      c: Math.min(accent.c * 0.18, 0.05),
      h: accent.h,
    }),
    "--color-accent-ink": formatOklch(inkOn(accent)),
  };
}

/** The four accent CSS vars for a dark-mode surface. */
export function darkAccentTokens(accent: Oklch): AccentTokens {
  return {
    "--color-accent": formatOklch(accent),
    "--color-accent-strong": formatOklch({
      ...accent,
      l: clamp(accent.l + 0.04, 0.2, 0.98),
    }),
    "--color-accent-soft": formatOklch({
      l: 0.3,
      c: Math.min(accent.c * 0.36, 0.06),
      h: accent.h,
    }),
    "--color-accent-ink": formatOklch(inkOn(accent)),
  };
}

/**
 * Stylesheet that overrides the accent tokens from globals.css.
 *
 * Selectors are escalated (`html:root`, `html.dark:root`) so this wins
 * regardless of where Next.js injects it relative to the app stylesheet, while
 * keeping dark above light.
 */
export function brandStylesheet(brand: Brand): string {
  const rule = (selector: string, tokens: AccentTokens) =>
    `${selector}{${Object.entries(tokens)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`;

  return [
    rule("html:root", lightAccentTokens(brand.accent)),
    rule("html.dark:root", darkAccentTokens(brand.accentDark)),
  ].join("");
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

/**
 * What `/admin` can change, as typed by the operator. Every field is optional
 * and a blank one means "inherit the layer below" — that's how Reset works.
 * Colours and URLs are validated when the brand is materialized, so a bad value
 * degrades to the default instead of rejecting the whole save.
 */
export const brandOverridesSchema = z
  .object({
    siteName: z.string().trim().max(64),
    tagline: z.string().trim().max(300),
    logoUrl: z.string().trim().max(500),
    faviconUrl: z.string().trim().max(500),
    accent: z.string().trim().max(64),
    accentDark: z.string().trim().max(64),
  })
  .partial()
  .strict();

export type BrandOverrides = z.infer<typeof brandOverridesSchema>;

/** The built-in fana theme — the floor under every other layer. */
export const DEFAULT_BRAND: Brand = {
  siteName: "fana",
  tagline:
    "A free email address that works instantly. Emails show up below the moment they arrive, then delete themselves — no signup.",
  logoUrl: "",
  faviconUrl: "",
  accent: DEFAULT_ACCENT,
  accentDark: deriveDarkAccent(DEFAULT_ACCENT),
};

/**
 * Only same-origin paths and http(s) URLs are allowed for brand assets, so a
 * bad value can't become a `javascript:` or `data:` URL.
 */
export function safeAssetUrl(input: string | undefined | null): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

/** Drop blank fields so they fall through to the layer below. */
export function compactOverrides(overrides: BrandOverrides): BrandOverrides {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => typeof v === "string" && v.trim()),
  ) as BrandOverrides;
}

/**
 * Resolve the effective brand.
 *
 * @param overrides saved from `/admin` (highest priority)
 * @param env only `SITE_NAME` is read here; everything else is DB or default
 */
export function resolveBrand(
  overrides: BrandOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): Brand {
  const o = compactOverrides(overrides);

  const accent = parseColor(o.accent) ?? DEFAULT_BRAND.accent;
  const accentDark = parseColor(o.accentDark) ?? deriveDarkAccent(accent);

  return {
    siteName: o.siteName ?? (env.SITE_NAME?.trim() || DEFAULT_BRAND.siteName),
    tagline: o.tagline ?? DEFAULT_BRAND.tagline,
    logoUrl: safeAssetUrl(o.logoUrl),
    faviconUrl: safeAssetUrl(o.faviconUrl),
    accent,
    accentDark,
  };
}
