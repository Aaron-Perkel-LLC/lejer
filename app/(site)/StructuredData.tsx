import { BRAND, appUrl } from "@/lib/brand";
import { HOME_DESCRIPTION } from "@/lib/site";

// Structured data for search (schema.org JSON-LD) on the home page: who makes it, what the site
// is called and its other spellings (so "uselejer" and "use lejer" resolve to it), and what the
// product is. Search engines read it to build their picture of the brand; nothing on the page
// depends on it. Every name comes from BRAND (the brand verify suite checks for literals).
export default function StructuredData() {
  const org = appUrl("/#organization");
  const handle = BRAND.domain.split(".")[0];
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": org, name: BRAND.legalName, url: BRAND.legalUrl, email: BRAND.contactEmail, brand: { "@type": "Brand", name: BRAND.name } },
      { "@type": "WebSite", "@id": appUrl("/#website"), url: appUrl(), name: BRAND.name, alternateName: [handle, `use ${BRAND.name}`, `${BRAND.name} app`], inLanguage: "en-US", publisher: { "@id": org } },
      {
        "@type": "WebApplication",
        "@id": appUrl("/#app"),
        name: BRAND.name,
        url: appUrl(),
        description: HOME_DESCRIPTION,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": org },
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
