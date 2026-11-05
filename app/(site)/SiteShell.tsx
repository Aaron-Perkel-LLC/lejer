import Link from "next/link";
import { signOut } from "@/app/(site)/login/actions";
import { archivo, martian } from "@/app/site-fonts";
import LegalLine from "@/app/components/LegalLine";
import { BRAND } from "@/lib/brand";
import { launchGated } from "@/lib/gate";
import { SITE_LINKS } from "@/lib/site";
import { ADMIN_PATH } from "@/lib/superadmin";
import type { User } from "@/lib/types";
import SiteNav from "./SiteNav";
import "../globals.css";
import "./site.css";

// The public site's <html>: the drafting sheet (site.css on html[data-site]), its one-row
// header and footer. Two root layouts render it: app/(site) (the home page, how it works,
// about, /login) and app/(app) (account, your households, onboarding: the pages outside any
// household, which wear the site's look rather than a household theme). It is a separate
// root from the household app (app/components/AppShell.tsx), so crossing between them (the
// demo link, a finished sign-in, "Open your household") is a full page load and neither
// <html> carries into the other. globals.css comes along for Tailwind's base and the
// reduced-motion rule; site.css overrides its theme on html[data-site]. The faces are shared
// with the sheet theme (app/site-fonts.ts).

export default function SiteShell({
  user,
  home,
  back = null,
  operator = false,
  children,
}: {
  /** The signed-in person, if any. */
  user: User | null;
  /** Where "Open your household" goes (homePath), or null signed out. */
  home: string | null;
  /** The person's own pages (account, households, onboarding): the household to go back to. */
  back?: { name: string; href: string } | null;
  /** An operator account on its pages (/admin): wordmark, "Admin", Sign out, and nothing of a household's. */
  operator?: boolean;
  children: React.ReactNode;
}) {
  // While the launch gate is on, the page links and the demo are gone from header and footer;
  // the way in (Sign in / Open your household) and the legal line stay.
  const gated = launchGated();
  return (
    <html lang="en" data-site="">
      <body>
        <div className={`site ${archivo.variable} ${martian.variable}`}>
          {/* One row at every width: wordmark, the two page links, then the way in (or, on the person's own pages, the way back). */}
          <header className="s-header">
            <div className="s-wrap s-header-row">
              <Link href="/" className="s-wordmark">
                {BRAND.name}
              </Link>
              {operator ? (
                <div className="s-header-actions s-header-operator">
                  <span className="s-key">Admin</span>
                  <form action={signOut}>
                    <button type="submit" className="s-link">
                      Sign out
                    </button>
                  </form>
                </div>
              ) : back ? (
                /* A page of the person's own: the way back names the household it came from. */
                <div className="s-header-actions">
                  <Link className="s-link" href={back.href}>
                    ← {back.name}
                  </Link>
                </div>
              ) : (
                <>
                  {!gated && <SiteNav />}
                  <div className="s-header-actions">
                    {home ? (
                      /* The full label from 640px; on a phone the header row has no room for it. */
                      <Link className="s-btn s-btn-sm" href={home}>
                        <span className="s-header-cta-long">{home === "/new" ? "Set up your household" : home === ADMIN_PATH ? "Admin" : "Open your household"}</span>
                        <span className="s-header-cta-short" aria-hidden="true">{home === "/new" ? "Set up" : home === ADMIN_PATH ? "Admin" : "Open"}</span>
                      </Link>
                    ) : (
                      <>
                        <Link className="s-link" href="/login">
                          Sign in
                        </Link>
                        {/* On a phone the hero's demo link is a thumb away, so the button yields the room. */}
                        {!gated && (
                          <Link className="s-btn s-btn-sm s-btn-line s-header-demo" href="/demo">
                            Try the demo
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </header>

          {children}

          <footer className="s-footer">
            <div className="s-wrap s-footer-row">
              <Link href="/" className="s-wordmark s-wordmark-sm">
                {BRAND.name}
              </Link>
              {!operator && (
              <nav className="s-footer-links" aria-label="Footer">
                {!gated &&
                  SITE_LINKS.map((s) => (
                    <Link key={s.href} href={s.href}>
                      {s.label}
                    </Link>
                  ))}
                {user ? (
                  <>
                    <Link href="/households">Your households</Link>
                    <Link href="/account">Account</Link>
                  </>
                ) : (
                  <Link href="/login">Sign in</Link>
                )}
                {!gated && <Link href="/demo">Try the demo</Link>}
                {user && (
                  <form action={signOut}>
                    <button type="submit">Sign out</button>
                  </form>
                )}
              </nav>
              )}
              <LegalLine className="s-footer-note" />
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
