"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ChevronIcon } from "./icons";

// Header: the household name as the wordmark (tagline beside it from md), always a link home;
// the household's section links; and at the right edge one menu under the person's name for
// everything that is theirs rather than the household's: the other households they're in (the
// switcher lives here, so the wordmark never hides a dropdown), Account, Your households, Sign
// out. Below sm both fold into one disclosure whose button names the page you're on. Menus close
// on navigation, Escape and a click outside. Peach's awning tops the header, its scalloped hem
// hanging over the bar, and japandi's noren hangs there from its oak rod (.awning is display:
// none in statement and sheet). Server actions arrive as props.

export interface NavProps {
  brand: string;
  tagline: string | null;
  /** Where the wordmark goes: the household's dashboard, or the public site outside one. */
  home: string;
  links: { href: string; label: string }[];
  households: { id: number; name: string; href: string }[];
  currentHouseholdId: number | null;
  demo: boolean;
  /** The signed-in person, for the name menu; null signed out (the demo). */
  user: { name: string; email: string } | null;
  signOut: () => Promise<void>;
}

/** The name menu's links: the person's own pages, outside any household. */
const YOU_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/households", label: "Your households" },
];

export default function Nav({ brand, tagline, home, links, households, currentHouseholdId, demo, user, signOut }: NavProps) {
  const pathname = usePathname();
  // The dashboard is the household's own root, so it only matches exactly. Among the rest the
  // longest matching prefix wins, so Settings (/household/settings) doesn't also light Household.
  const matches = (href: string) => (href === home ? pathname === home : pathname === href || pathname.startsWith(`${href}/`));
  const current = [...links.map((l) => l.href), ...YOU_LINKS.map((l) => l.href)].filter(matches).sort((x, y) => y.length - x.length)[0];
  const isActive = (href: string) => href === current;
  const menu = useRef<HTMLDetailsElement>(null);
  const you = useRef<HTMLDetailsElement>(null);
  const others = households.filter((h) => h.id !== currentHouseholdId);
  const here = links.find((l) => isActive(l.href))?.label ?? YOU_LINKS.find((l) => isActive(l.href))?.label;

  // A disclosure stays open across client navigations; close them all whenever the page changes.
  useEffect(() => {
    for (const d of [menu, you]) d.current?.removeAttribute("open");
  }, [pathname]);

  // …and on Escape (focus back to its button) or a click anywhere outside it, like any menu.
  useEffect(() => {
    const open = () => [menu.current, you.current].filter((d): d is HTMLDetailsElement => !!d?.open);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of open()) {
        d.removeAttribute("open");
        d.querySelector("summary")?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      for (const d of open()) if (!d.contains(e.target as Node)) d.removeAttribute("open");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  /** The person's other households, first in their menu: switching is theirs, not the household's. */
  const switchList = (linkClass: string) =>
    others.length > 0 && (
      <>
        {others.map((h) => (
          <Link key={h.id} href={h.href} className={linkClass}>
            {h.name}
          </Link>
        ))}
      </>
    );

  const wordmark = (
    <>
      <span className="wordmark">{brand}</span>
      {tagline && <span className="eyebrow mt-0.5 hidden truncate md:inline">{tagline}</span>}
    </>
  );

  return (
    <header className="relative border-b border-line-soft bg-panel pt-[env(safe-area-inset-top)]">
      <div className="awning" aria-hidden="true" />
      <div className="mx-auto flex h-13 max-w-[1000px] items-center justify-between gap-4 px-4 sm:px-5 [[data-theme=peach]_&]:h-14">
        <Link href={home} className="flex min-w-0 items-baseline gap-3 no-underline">
          {wordmark}
        </Link>

        <div className="flex h-full shrink-0 items-center gap-3">
          {/* sm and up: the links in a row */}
          <nav className="hidden h-full items-center gap-5 sm:flex" aria-label="Main navigation">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-link">
                {label}
              </Link>
            ))}
          </nav>

          {user && (
            <>
              {links.length > 0 && <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />}
              <details ref={you} className="relative hidden h-full sm:block">
                <summary className="nav-link cursor-pointer list-none gap-1.5 [&::-webkit-details-marker]:hidden">
                  <span className="max-w-40 truncate">{user.name}</span>
                  <ChevronIcon />
                </summary>
                <div className="nav-dropdown">
                  <span className="block truncate px-3 pb-1 pt-2 text-xs text-ink-muted">{user.email}</span>
                  {others.length > 0 && (
                    <div className="border-b border-line-soft pb-1">
                      <span className="eyebrow block px-3 pb-0.5 pt-2">Switch to</span>
                      {switchList("nav-dropdown-link")}
                    </div>
                  )}
                  {YOU_LINKS.map(({ href, label }) => (
                    <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-dropdown-link">
                      {label}
                    </Link>
                  ))}
                  <form action={signOut} className="mt-1 border-t border-line-soft pt-1">
                    <button type="submit" className="nav-dropdown-link text-ink-muted hover:text-ink">
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            </>
          )}

          {demo && !user && (
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          )}

          {/* Below sm: one disclosure. Static positioning so the sheet spans the header. */}
          {(links.length > 0 || user) && (
            <details ref={menu} className="nav-menu sm:hidden">
              <summary>
                <span>{here ?? "Menu"}</span>
                {here && <span className="sr-only">, menu</span>}
                <span className="text-ink-muted">
                  <ChevronIcon />
                </span>
              </summary>
              <nav className="nav-menu-sheet" aria-label="Main navigation">
                {links.map(({ href, label }) => (
                  <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-menu-link">
                    {label}
                  </Link>
                ))}
                {user && (
                  <>
                    {others.length > 0 && (
                      <>
                        <span className="eyebrow block pb-1 pt-4">Switch to</span>
                        {switchList("nav-menu-link")}
                      </>
                    )}
                    <span className="eyebrow block truncate pb-1 pt-4">{user.name}</span>
                    {YOU_LINKS.map(({ href, label }) => (
                      <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="nav-menu-link">
                        {label}
                      </Link>
                    ))}
                    <form action={signOut}>
                      <button type="submit" className="nav-menu-link cursor-pointer border-b-0">
                        Sign out
                      </button>
                    </form>
                  </>
                )}
              </nav>
            </details>
          )}
        </div>
      </div>
    </header>
  );
}
