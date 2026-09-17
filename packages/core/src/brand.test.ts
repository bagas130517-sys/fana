import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ACCENT,
  DEFAULT_BRAND,
  brandOverridesSchema,
  brandStylesheet,
  compactOverrides,
  darkAccentTokens,
  deriveDarkAccent,
  formatOklch,
  oklchToHex,
  lightAccentTokens,
  parseColor,
  REPO_URL,
  resolveBrand,
  safeAssetUrl,
  srgbToOklch,
} from "./brand.js";

test("parseColor reads oklch with and without a percent", () => {
  assert.deepEqual(parseColor("oklch(56% 0.17 274)"), {
    l: 0.56,
    c: 0.17,
    h: 274,
  });
  assert.deepEqual(parseColor("oklch(0.56 0.17 274)"), {
    l: 0.56,
    c: 0.17,
    h: 274,
  });
});

test("parseColor reads 3- and 6-digit hex", () => {
  const short = parseColor("#fff");
  const long = parseColor("#ffffff");
  assert.ok(short && long);
  assert.equal(formatOklch(short), formatOklch(long));
  assert.ok(Math.abs(short.l - 1) < 1e-6);
  assert.ok(short.c < 1e-6);
});

test("parseColor rejects junk, including CSS injection attempts", () => {
  for (const input of [
    "",
    undefined,
    null,
    "red",
    "#ggg",
    "rgb(1,2,3)",
    "oklch(56% 0.17 274); } html { display:none",
    "url(javascript:alert(1))",
  ]) {
    assert.equal(parseColor(input), null, `expected null for ${String(input)}`);
  }
});

test("srgbToOklch matches known values", () => {
  const white = srgbToOklch(1, 1, 1);
  assert.ok(Math.abs(white.l - 1) < 1e-3);
  assert.ok(white.c < 1e-3);

  const black = srgbToOklch(0, 0, 0);
  assert.ok(black.l < 1e-6);

  // Pure sRGB red ≈ oklch(62.8% 0.258 29.2)
  const red = srgbToOklch(1, 0, 0);
  assert.ok(Math.abs(red.l - 0.6279) < 2e-3);
  assert.ok(Math.abs(red.c - 0.2577) < 2e-3);
  assert.ok(Math.abs(red.h - 29.23) < 0.5);
});

test("default accent reproduces the tokens shipped in globals.css", () => {
  assert.deepEqual(lightAccentTokens(DEFAULT_ACCENT), {
    "--color-accent": "oklch(56% 0.17 274)",
    "--color-accent-strong": "oklch(50% 0.19 274)",
    "--color-accent-soft": "oklch(95% 0.031 274)",
    "--color-accent-ink": "oklch(99% 0 0)",
  });
  assert.deepEqual(darkAccentTokens(deriveDarkAccent(DEFAULT_ACCENT)), {
    "--color-accent": "oklch(74% 0.14 274)",
    "--color-accent-strong": "oklch(78% 0.14 274)",
    "--color-accent-soft": "oklch(30% 0.05 274)",
    "--color-accent-ink": "oklch(17% 0.02 274)",
  });
});

test("accent tokens keep the hue and stay in gamut-ish range", () => {
  const accent = { l: 0.62, c: 0.24, h: 12 };
  for (const tokens of [
    lightAccentTokens(accent),
    darkAccentTokens(deriveDarkAccent(accent)),
  ]) {
    for (const value of Object.values(tokens)) {
      const parsed = parseColor(value);
      assert.ok(parsed, `${value} should re-parse`);
      assert.ok(parsed.l >= 0 && parsed.l <= 1);
      assert.ok(parsed.c >= 0 && parsed.c <= 0.4);
    }
    assert.equal(parseColor(tokens["--color-accent"])!.h, 12);
  }
});

test("a light accent gets dark ink on top of it", () => {
  const ink = lightAccentTokens({ l: 0.9, c: 0.15, h: 90 })["--color-accent-ink"];
  assert.ok(parseColor(ink)!.l < 0.3);
});

test("brandStylesheet escalates specificity and keeps dark last", () => {
  const css = brandStylesheet(DEFAULT_BRAND);
  assert.ok(css.startsWith("html:root{"));
  assert.ok(css.includes("html.dark:root{"));
  assert.ok(css.indexOf("html.dark:root") > css.indexOf("html:root"));
  assert.ok(!/[<>]/.test(css), "stylesheet must not contain markup characters");
});

test("safeAssetUrl allows http(s) and same-origin paths only", () => {
  assert.equal(safeAssetUrl("https://cdn.example.com/logo.svg"), "https://cdn.example.com/logo.svg");
  assert.equal(safeAssetUrl("/logo.svg"), "/logo.svg");
  assert.equal(safeAssetUrl("  /logo.svg  "), "/logo.svg");
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "//evil.example.com", "", undefined]) {
    assert.equal(safeAssetUrl(bad), "", `expected "" for ${String(bad)}`);
  }
});

test("no overrides and no env resolves to the built-in fana theme", () => {
  assert.deepEqual(resolveBrand({}, {}), DEFAULT_BRAND);
});

test("SITE_NAME is the one branding value env still supplies", () => {
  assert.equal(resolveBrand({}, { SITE_NAME: "mail.acme.dev" }).siteName, "mail.acme.dev");
  assert.equal(resolveBrand({}, { SITE_NAME: "  " }).siteName, DEFAULT_BRAND.siteName);
  // A saved override wins over env.
  assert.equal(
    resolveBrand({ siteName: "acme.mail" }, { SITE_NAME: "mail.acme.dev" }).siteName,
    "acme.mail",
  );
});

test("overrides drive the brand and invalid colours degrade to the default", () => {
  const brand = resolveBrand({
    tagline: "Throwaway inboxes for Acme.",
    accent: "#e11d48",
    logoUrl: "/brand/acme.svg",
  });
  assert.equal(brand.tagline, "Throwaway inboxes for Acme.");
  assert.equal(brand.logoUrl, "/brand/acme.svg");
  assert.ok(Math.abs(brand.accent.h - 17.6) < 1); // rose
  assert.deepEqual(brand.accentDark, deriveDarkAccent(brand.accent));

  assert.deepEqual(resolveBrand({ accent: "chartreuse" }).accent, DEFAULT_ACCENT);
});

test("an explicit dark accent wins over the derived one", () => {
  const brand = resolveBrand({
    accent: "oklch(56% 0.17 274)",
    accentDark: "oklch(80% 0.1 100)",
  });
  assert.deepEqual(brand.accentDark, { l: 0.8, c: 0.1, h: 100 });
});

test("the attribution link is hardcoded, not themeable", () => {
  assert.equal(REPO_URL, "https://github.com/JastinXyz/fana");
  assert.ok(!("repoUrl" in DEFAULT_BRAND));
  assert.ok(!brandOverridesSchema.safeParse({ repoUrl: "https://evil.example" }).success);
});

test("blank overrides fall through instead of blanking the brand", () => {
  assert.deepEqual(compactOverrides({ siteName: "", tagline: "  ", accent: "#fff" }), {
    accent: "#fff",
  });
  assert.equal(resolveBrand({ tagline: "" }).tagline, DEFAULT_BRAND.tagline);
});

test("brandOverridesSchema rejects unknown keys and overlong values", () => {
  assert.ok(brandOverridesSchema.safeParse({ siteName: "acme" }).success);
  assert.ok(brandOverridesSchema.safeParse({}).success);
  assert.ok(!brandOverridesSchema.safeParse({ adminToken: "x" }).success);
  assert.ok(!brandOverridesSchema.safeParse({ tagline: "x".repeat(301) }).success);
});

test("oklchToHex round-trips the colours an operator can enter", () => {
  // Every hex the picker accepts should survive hex → OKLCH → hex. This is the
  // check that matters: the OG image renders from the hex, the stylesheet from
  // the OKLCH, and the two must be the same colour.
  for (const hex of [
    "#000000",
    "#ffffff",
    "#4f46e5",
    "#e11d48",
    "#16a34a",
    "#f59e0b",
    "#0ea5e9",
    "#7c3aed",
  ]) {
    const parsed = parseColor(hex);
    assert.ok(parsed, `${hex} should parse`);
    assert.equal(oklchToHex(parsed), hex, `${hex} did not round-trip`);
  }
});

test("oklchToHex clips out-of-gamut colours instead of producing nonsense", () => {
  // Chroma far beyond sRGB — the result must still be a usable colour.
  const hex = oklchToHex({ l: 0.6, c: 0.4, h: 20 });
  assert.match(hex, /^#[0-9a-f]{6}$/);
});

test("the built-in accent converts to a colour, not black", () => {
  const hex = oklchToHex(DEFAULT_ACCENT);
  assert.match(hex, /^#[0-9a-f]{6}$/);
  assert.notEqual(hex, "#000000");
});
