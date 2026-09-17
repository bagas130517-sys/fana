import { getBrand } from "@/lib/site";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/ogImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Disposable email";

// Branding is read per request, so the card cannot be baked at build time.
export const dynamic = "force-dynamic";

export default async function Image() {
  // The operator's own tagline — the front page's card should say what they
  // say it is, not what this project's default says.
  const brand = await getBrand();
  return renderOgImage("Disposable email", brand.tagline);
}
