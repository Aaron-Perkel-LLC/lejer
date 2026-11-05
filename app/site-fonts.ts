import { Archivo, Martian_Mono } from "next/font/google";

// The drafting sheet's two faces, declared once for every root that wears them: the public
// site (app/(site)/SiteShell.tsx), the 404 (app/global-not-found.tsx) and the sheet household
// theme (app/theme-fonts.ts). One declaration means one woff2 each in the build, and
// a visitor crossing from the site into a sheet household already has them cached. Preload
// follows the default theme (lib/theme.ts DEFAULT_THEME = sheet): Martian Mono, its ledger
// face, is the one face that preloads, on every root that imports it (the site wears it too);
// every other face, Archivo included, starts loading once a stylesheet asks for it (the tokens
// and http suites check: one preloaded font file per page).
export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--nf-archivo", preload: false });
export const martian = Martian_Mono({ subsets: ["latin"], axes: ["wdth"], variable: "--nf-martian" });
