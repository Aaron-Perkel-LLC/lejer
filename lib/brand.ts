// The product's name and addresses, in one place: the name may change before launch.
// Everything user-visible (page titles, copy, email, From addresses) and every cookie name reads
// from here; nothing else spells them out (`npm run verify` checks for stray literals).
// Renaming changes the cookie names, which signs everyone out once; that's accepted.
// Not covered: infrastructure identifiers (the lejer_app Postgres role, the Neon/Vercel project
// names, the npm package name), which change by migration, not by editing this file.
// Plain constants, so email templates (rendered outside Next) can import it too.

const NAME = "Lejer";
const DOMAIN = "uselejer.com";
const COOKIE_PREFIX = "lejer";
/** Who makes it: the footer's legal line, the About and Privacy pages. */
const LEGAL_NAME = "Aaron Perkel LLC";
const LEGAL_URL = "https://aaronperkel.com";

export const BRAND = {
  name: NAME,
  domain: DOMAIN,
  /** Production URL; NEXT_PUBLIC_APP_URL overrides it per environment (see appUrl()). */
  url: `https://${DOMAIN}`,
  /** Mail sends from the root domain; Resend's DNS (DKIM, return path) leaves root MX free. */
  mailDomain: DOMAIN,
  legalName: LEGAL_NAME,
  legalUrl: LEGAL_URL,
  /** People write here: the footer's Contact link, the Privacy page, the coming-soon page. */
  contactEmail: `hello@${DOMAIN}`,
  /** Account mail: login codes and invites. Display name is the product name, no Reply-To. */
  loginFrom: `login@${DOMAIN}`,
  /** Household mail, sent as "{household} via {name}". */
  notifyFrom: `notify@${DOMAIN}`,
  cookies: {
    session: `${COOKIE_PREFIX}_session`,
    /** Not a credential: the last household opened, so "Sign in" knows where to go. */
    household: `${COOKIE_PREFIX}_household`,
  },
} as const;

/** Absolute URL for this deployment (links in email, metadataBase). */
export function appUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || BRAND.url).replace(/\/+$/, "");
  return `${base}${path}`;
}
