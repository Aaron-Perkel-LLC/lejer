// The public site (home, how it works, about), in its own root layout at app/(site)/layout.tsx.
// "/" is the home page for everyone, signed in or not; households live at /{slug}
// (lib/paths.ts). proxy.ts lets these pages through without a session.

/** The home page's one-line description, for its meta tag and the structured data (app/(site)/StructuredData.tsx). */
export const HOME_DESCRIPTION = "Post each house bill with its statement. Everyone sees their share, gets reminded before it's due, and checks off when they've paid. Free, no ads.";

/** Site pages anyone can open, signed in or not. */
export const SITE_PAGES = /^\/(?:how-it-works|about|privacy)?$/;

/** The site's pages besides home (the wordmark is the way home), for the header and footer; /privacy is linked from the legal line only. */
export const SITE_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];
