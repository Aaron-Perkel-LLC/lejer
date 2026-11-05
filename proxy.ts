import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SLUG, HOUSEHOLD_HEADER, householdSlugOf } from "@/lib/paths";
import {
  HOUSEHOLD_COOKIE,
  RENEW_AFTER_SECONDS,
  SESSION_COOKIE,
  cookieOptions,
  createSessionToken,
  devBypass,
  readSessionToken,
} from "@/lib/session";
import { gatedRedirect, launchGated } from "@/lib/gate";
import { SITE_PAGES } from "@/lib/site";

// First lock only: a valid session cookie for everything that isn't public. Pages and server
// actions still authorize themselves (lib/auth.ts), and getCtx() checks the household the URL
// names against memberships; this file only reads the slug off the path (lib/paths.ts).

// Public surfaces. /api/documents/upload is public because Blob's upload-completed callback
// carries no cookie; the route gates token minting on admin of the key's household itself.
// /unsubscribe and its one-click endpoint carry their own signed token (lib/unsubscribe.ts).
// /api/queues is the ten-minute wake-up's consumer (lib/wake.ts): on Vercel a queue consumer has
// no public URL, Vercel's queue infrastructure is its only caller, and all it does is flush what
// has already waited out its window on the real clock, so a stray request could do no more than
// wake the database.
const PUBLIC = [
  /^\/login(?:\/|$)/,
  /^\/unsubscribe$/,
  /^\/api\/unsubscribe$/,
  /^\/cal\.ics$/,
  /^\/api\/cron(?:\/|$)/,
  /^\/api\/queues(?:\/|$)/,
  /^\/api\/documents\/upload$/,
];

/** How long the last-opened-household cookie lasts; refreshed on every visit. */
const HOUSEHOLD_COOKIE_DAYS = 365;

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const slug = householdSlugOf(path);
  const gated = launchGated();
  /** While gated, every response (pages, redirects, refusals) tells crawlers to stay away. */
  const robots = (res: NextResponse) => {
    if (gated) res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  };
  if (gated && gatedRedirect(path)) return robots(NextResponse.redirect(new URL("/", req.url)));

  // The URL's household, for getCtx(). Whatever the client sent under this name is dropped.
  const headers = new Headers(req.headers);
  headers.delete(HOUSEHOLD_HEADER);
  if (slug) headers.set(HOUSEHOLD_HEADER, slug);
  const pass = () => robots(NextResponse.next({ request: { headers } }));
  /** A signed-in GET of a household page: remember it as where "Sign in" goes next time. */
  const remember = (res: NextResponse) => {
    if (slug && slug !== DEMO_SLUG && req.method === "GET" && req.cookies.get(HOUSEHOLD_COOKIE)?.value !== slug) {
      res.cookies.set(HOUSEHOLD_COOKIE, slug, cookieOptions(HOUSEHOLD_COOKIE_DAYS));
    }
    return res;
  };

  // The public site, sign-in and the demo household need no session.
  if (SITE_PAGES.test(path) || PUBLIC.some((re) => re.test(path)) || slug === DEMO_SLUG) return pass();
  if (devBypass()) return remember(pass());

  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const res = remember(pass());
    if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER_SECONDS) {
      res.cookies.set(SESSION_COOKIE, await createSessionToken(session.uid), cookieOptions());
    }
    return res;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return robots(new NextResponse("Unauthorized", { status: 401 }));
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", path + req.nextUrl.search);
  return robots(NextResponse.redirect(login));
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|icon|apple-icon|apple-touch-icon|opengraph-image|robots\\.txt|sitemap\\.xml|site\\.webmanifest).*)",
  ],
};
