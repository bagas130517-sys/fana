import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { brandStylesheet } from "@fana/core/brand";
import "./globals.css";
import { getBrand, siteUrl } from "@/lib/site";
import { BrandProvider } from "@/components/BrandProvider";
import { Toaster } from "@/components/ui/Toaster";

// Branding is read per request (DB via the API), so saving it in /admin takes
// effect without a rebuild. That rules out static prerendering.
export const dynamic = "force-dynamic";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const title = `${brand.siteName} — disposable email`;

  return {
    // Without this the `opengraph-image` route resolves to a relative URL, and
    // the crawlers that render a link preview will not fetch one.
    metadataBase: new URL(siteUrl()),
    title,
    description: brand.tagline,
    openGraph: {
      type: "website",
      siteName: brand.siteName,
      title,
      description: brand.tagline,
    },
    twitter: { card: "summary_large_image", title, description: brand.tagline },
    ...(brand.faviconUrl ? { icons: { icon: brand.faviconUrl } } : {}),
  };
}

// Runs before paint to apply the saved/system theme without a flash.
const themeScript = `
try {
  var t = localStorage.getItem('fana:theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getBrand();

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Accent tokens derived from BRAND_ACCENT; values are re-emitted as
            numeric oklch() by @fana/core, never passed through raw. */}
        <style dangerouslySetInnerHTML={{ __html: brandStylesheet(brand) }} />
      </head>
      <body className="min-h-screen antialiased">
        {/* Route transitions are server-rendered, so without this a click can
            look like nothing happened. Colour follows the brand accent. */}
        <NextTopLoader
          color="var(--color-accent)"
          height={2}
          shadow={false}
          showSpinner={false}
        />
        <BrandProvider brand={brand}>{children}</BrandProvider>
        <Toaster />
      </body>
    </html>
  );
}
