import type { Viewport } from "next";
import Link from "next/link";
import DeletionBanner from "@/app/components/DeletionBanner";
import LegalLine from "@/app/components/LegalLine";
import Nav from "@/app/components/Nav";
import { signOut } from "@/app/(site)/login/actions";
import { themeFaces } from "@/app/theme-fonts";
import { BRAND } from "@/lib/brand";
import { STATEMENT_DARK, THEME_COLORS } from "@/lib/theme-tokens";
import type { Ctx } from "@/lib/context";
import { hasFeature, navLinks } from "@/lib/features";
import type { MyHousehold } from "@/lib/households";
import { householdPath } from "@/lib/paths";
import { themeAttrs } from "@/lib/theme";
import type { User } from "@/lib/types";
import "../globals.css";

// The household app's <html>: the root layout of app/(household)/[household], re-rendered
// whenever the slug changes, since the theme sits on <html> and a root layout isn't re-rendered
// by a client navigation that keeps it. The pages outside a household (/account, /households,
// /new, /login) live on the public site's root (app/(site)/SiteShell.tsx), so crossing between
// the two is a full page load. ctx is null only for a signed-in visitor on a slug they aren't a
// member of (the page then renders not-found inside this shell).

// Every theme face is declared once, in app/theme-fonts.ts (onboarding's theme previews wear them too).

// The browser chrome follows the page color of the household's theme (statement follows the
// system's light/dark; the light-only themes are always their page color). viewportFit cover:
// see the safe-area rule on body in globals.css.
export function appViewport(ctx: Ctx | null): Viewport {
  const h = ctx?.household;
  if (h && h.theme !== "statement") return { viewportFit: "cover", themeColor: THEME_COLORS[h.theme].page };
  if (h?.colorScheme === "light") return { viewportFit: "cover", themeColor: THEME_COLORS.statement.page };
  return {
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: THEME_COLORS.statement.page },
      { media: "(prefers-color-scheme: dark)", color: STATEMENT_DARK.page },
    ],
  };
}

// The shell opens no transaction of its own: the layout hands it the session's households
// (getMyHouseholds, from the one session load every page shares).
export default async function AppShell({ ctx, user, households, children }: { ctx: Ctx | null; user: User | null; households: MyHousehold[]; children: React.ReactNode }) {
  // The household's sections; the name menu carries the person's own pages. Without a ctx
  // (a slug the viewer isn't in) there are no sections and the wordmark goes to the site.
  const links = ctx ? navLinks(ctx) : [];
  const home = ctx ? householdPath(ctx.household) : "/";
  const contact = ctx?.household.replyTo;
  const { theme, scheme } = themeAttrs(ctx?.household); // ThemeSync (the template) keeps these fresh after a save

  return (
    <html
      lang="en"
      className={themeFaces}
      data-theme={theme}
      data-color-scheme={scheme}
    >
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink">
        <Nav
          brand={ctx?.household.name ?? BRAND.name}
          tagline={ctx?.household.tagline ?? null}
          home={home}
          links={links}
          households={households.map((h) => ({ id: h.id, name: h.name, href: householdPath(h) }))}
          currentHouseholdId={ctx?.household.id ?? null}
          demo={ctx?.demo ?? false}
          user={user && { name: user.name, email: user.email }}
          signOut={signOut}
        />
        {ctx?.demo && (
          <div className="border-b border-line-soft bg-accent-soft px-4 py-2 text-center text-sm">
            You&apos;re looking at a demo household. Nothing here is real and changes aren&apos;t saved.
          </div>
        )}
        {ctx && <DeletionBanner ctx={ctx} />}
        <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 py-8 sm:px-5 [[data-theme=japandi]_&]:py-10">{children}</div>
        <footer className="mx-auto w-full max-w-[1000px] px-4 pb-8 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4 text-xs text-ink-muted">
            <span className="font-mono uppercase tracking-[0.1em] [[data-theme=peach]_&]:font-bold">
              {ctx ? `${ctx.household.name} · ${BRAND.name}` : BRAND.name}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {ctx && hasFeature(ctx.household, "welcomeTour") && (
                <Link className="underline decoration-line underline-offset-2 hover:text-ink" href={householdPath(ctx.household, "/welcome")}>
                  How this works
                </Link>
              )}
              {contact && (
                <a className="hover:text-ink" href={`mailto:${contact}`}>
                  {contact}
                </a>
              )}
            </span>
          </div>
          <LegalLine className="mt-3 text-xs text-ink-muted" linkClassName="hover:text-ink hover:underline underline-offset-2" />
        </footer>
      </body>
    </html>
  );
}
