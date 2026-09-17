import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/ogImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "API reference";

// Branding is read per request, so the card cannot be baked at build time.
export const dynamic = "force-dynamic";

export default function Image() {
  return renderOgImage("API reference", "Disposable inboxes, over HTTP");
}
