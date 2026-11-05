import type { Metadata } from "next";
import { BRAND, appUrl } from "@/lib/brand";
import { launchGated } from "@/lib/gate";

// Shared by the root layouts: the public site (app/(site)/layout.tsx), a household's pages
// (app/(household)/[household]/layout.tsx) and the account pages (app/(app)/layout.tsx).
// Separate root layouts make Next do a full page load when a visitor crosses between them, so
// no world's <html> leaks into another.
export const baseMetadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: BRAND.name, template: `%s — ${BRAND.name}` },
  description: `${BRAND.name}: split household bills with your roommates, and keep who owes what on record.`,
  applicationName: BRAND.name,
  openGraph: { siteName: BRAND.name, type: "website", locale: "en_US" },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  // While the launch gate is on: noindex in the head too (proxy.ts sets the header on every
  // response, app/robots.ts disallows everything). Evaluated when the server loads the module,
  // which is per deployment, the same granularity as the env var itself.
  ...(launchGated() ? { robots: { index: false, follow: false } } : {}),
};

/**
 * A public page's metadata with its canonical URL (and og:url) set to `path`, so query strings
 * (`?next=`, `?ok=`) and the www host fold into one URL in search. A page's `openGraph` replaces
 * the layout's whole object, so the shared fields are carried over here.
 */
export function publicPage(path: string, metadata: Metadata): Metadata {
  return { ...metadata, alternates: { canonical: path }, openGraph: { ...baseMetadata.openGraph, url: path } };
}
