import { Courier_Prime, Fraunces, IBM_Plex_Mono, Karla } from "next/font/google";
import localFont from "next/font/local";
import { archivo, martian } from "@/app/site-fonts";

// Every household theme's faces, declared once; globals.css picks per theme through --nf-*.
// Two places wear them: the household app's <html> (app/components/AppShell.tsx) and the theme
// previews on onboarding (/new), which draws each theme in its own faces on the site's root.
// Only the default theme's ledger face preloads (sheet's Martian Mono, app/site-fonts.ts).
// Every other face loads only on a page that uses it, so a sheet household never downloads them. Japandi's are Japanese faces that
// Google serves sliced into hundreds of files (6.5 MB through next/font/google even with the
// latin subset), so they are self-hosted from app/fonts as exact latin subsets (51 KB; see
// app/fonts/README.md). The tokens verify suite checks these flags and that budget.
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--nf-plex", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--nf-fraunces", preload: false });
const karla = Karla({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--nf-karla", preload: false });
const courier = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--nf-courier", preload: false });
const zen = localFont({
  src: [
    { path: "./fonts/zen-kaku-gothic-new-400-latin.woff2", weight: "400" },
    { path: "./fonts/zen-kaku-gothic-new-500-latin.woff2", weight: "500" },
    { path: "./fonts/zen-kaku-gothic-new-700-latin.woff2", weight: "700" },
  ],
  variable: "--nf-zen",
  preload: false,
});
const mplus = localFont({ src: "./fonts/m-plus-1-code-latin.woff2", weight: "400 700", variable: "--nf-mplus", preload: false });

/** Every theme face's --nf-* variable class, for the element that wears them. Sheet's are the site's (app/site-fonts.ts). */
export const themeFaces = [plex, fraunces, karla, courier, zen, mplus, archivo, martian].map((f) => f.variable).join(" ");
