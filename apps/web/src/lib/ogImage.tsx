import { ImageResponse } from "next/og";
import { oklchToHex } from "@fana/core/brand";
import { getBrand, siteUrl } from "@/lib/site";

/**
 * The link preview card, drawn per instance.
 *
 * Same reason the docs page lives in the app: a self-hoster's link should show
 * their name and their accent, not this project's. A static PNG in /public
 * could not do that.
 *
 * Colours are converted out of OKLCH first — the renderer behind `next/og`
 * understands plain sRGB only, and an `oklch()` string silently renders as
 * nothing at all.
 *
 * No font is loaded. `next/og` ships one face and one weight, so `fontWeight`
 * is ignored here and hierarchy comes from size, colour and spacing instead.
 * Loading a real family would mean either a network fetch on the path that
 * renders a social card or a binary in the repo, and neither is worth it for
 * bold text.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Longer than this and the card is a paragraph, not a headline. */
const MAX_HEADLINE = 150;

/**
 * The headline is an operator's tagline, so its length is unbounded — a long
 * one at a fixed size fills the card and crushes everything around it. Step the
 * size down instead of truncating, and only cut at a length nothing survives.
 */
function headlineStyle(text: string): { text: string; fontSize: number } {
  const clipped =
    text.length > MAX_HEADLINE ? `${text.slice(0, MAX_HEADLINE - 1).trimEnd()}…` : text;
  const fontSize = clipped.length > 100 ? 40 : clipped.length > 60 ? 50 : 64;
  return { text: clipped, fontSize };
}

export async function renderOgImage(eyebrow: string, headline: string) {
  const brand = await getBrand();
  const accent = oklchToHex(brand.accent);
  const [head, ...tail] = brand.siteName.split(".");
  const host = siteUrl().replace(/^https?:\/\//, "");
  const title = headlineStyle(headline);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0b0b0f",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        {/* A band of the instance's accent, so the card is recognisably theirs
            at the size a timeline renders it. A flex child rather than an
            absolute one: a percentage width would resolve against the padded
            box below and stop short of the edge. */}
        <div style={{ display: "flex", width: "100%", height: 14, background: accent }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: 72,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 42 }}>
            {/* Same rule as the Wordmark component: the accent is on the TLD,
                or on the whole name when there isn't one. */}
            <span style={tail.length > 0 ? undefined : { color: accent }}>{head}</span>
            {tail.length > 0 && <span style={{ color: accent }}>.{tail.join(".")}</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 3,
                textTransform: "uppercase",
                color: accent,
                marginBottom: 18,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: title.fontSize,
                lineHeight: 1.2,
                maxWidth: 960,
              }}
            >
              {title.text}
            </div>
          </div>

          {/* Balances the column and tells a reader where the card came from,
              which the wordmark alone doesn't for a self-hosted name. */}
          <div style={{ display: "flex", fontSize: 24, color: "#8b8b96" }}>{host}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
