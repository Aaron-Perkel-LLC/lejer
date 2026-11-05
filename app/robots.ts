import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/brand";

// robots.txt: crawling is allowed even while the launch gate is on (lib/gate.ts). The gate keeps
// pages out of search with noindex (the proxy's X-Robots-Tag and baseMetadata's meta tag), and a
// crawler only sees noindex on a page it may fetch: a Disallow would leave a linked URL indexable
// as a bare link. Household pages need a session anyway; the proxy sends crawlers to /login.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: appUrl("/sitemap.xml") };
}
