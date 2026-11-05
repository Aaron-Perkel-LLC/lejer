import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/brand";
import { launchGated } from "@/lib/gate";
import { DEMO_SLUG } from "@/lib/paths";

// sitemap.xml, linked from robots.txt: the public pages a search engine may index. Empty while
// the launch gate is on (lib/gate.ts), since every page then says noindex and a listed noindex
// URL is an error in Search Console. Households need a session; only the demo is public.
export const dynamic = "force-dynamic";

const PAGES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/how-it-works", priority: 0.8 },
  { path: "/about", priority: 0.6 },
  { path: `/${DEMO_SLUG}`, priority: 0.6 },
  { path: "/privacy", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (launchGated()) return [];
  return PAGES.map(({ path, priority }) => ({ url: appUrl(path), changeFrequency: "monthly", priority }));
}
