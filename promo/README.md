# Promo images

Not part of the app: `tsconfig.json` excludes this folder and nothing in `app/` imports it.

```bash
npm run promo        # regenerates everything into promo/out/ (gitignored), ~20 s
```

- `copy.ts`: every word and figure on the images. Edit, then rerun.
- `build.ts`: starts `next dev` on port 4319 (or set `PROMO_URL` to a deployment; for a
  protected preview also set `VERCEL_AUTOMATION_BYPASS_SECRET`), captures `/demo` in the sheet
  theme (the demo banner and Sign in removed), writes each canvas as HTML on
  `app/(site)/site.css` and the site's faces (Archivo, Martian Mono, from Google Fonts), and
  renders it to PNG with Playwright at its exact size.
- `promo.css`: poster layout in the site's language (DESIGN.md, Public Site).
- `promo/out/index.html`: a contact sheet of the set, the profile mark at Instagram's sizes included.

Two stages, each its own folder: `soon/` (before opening: "Coming soon", join the list for the
launch email) and `launch/` ("Now open"). The copy for both is in `copy.ts` (`STAGES`,
`CAROUSELS`).

| File (in `soon/` and `launch/`) | Size | For |
|---|---|---|
| `ig-post.png` | 1080×1350 | Instagram feed: the four shares |
| `phones.png` | 1080×1350 | Instagram feed or LinkedIn portrait: two phones |
| `ig-story.png` | 1080×1920 | Instagram story: the four shares |
| `ig-story-phone.png` | 1080×1920 | Instagram story: one phone |
| `linkedin-phones.png` | 1200×627 | LinkedIn: two phones |
| `linkedin.png` | 1200×627 | LinkedIn: two shares |
| `ig-carousel-1…6.png` | 1080×1350 | Instagram carousel |

Also `launch/overview.png` (1080×1350, the overview in a browser frame) and
`profile/ig-profile.png`, `profile/ig-profile-light.png` (1080×1080, the profile mark).
Stories keep the top 220 px and bottom 280 px clear of Instagram's own UI.

**Posts.** `posts.ts` groups the images into posts and holds their words. Each becomes a
folder in `promo/out/posts/{instagram,linkedin}/<stage>-<n>-<what>/` with the images in posting
order (`1-….png`, `2-….png`), `caption.txt` to paste, `alt-text.txt` (one line per image),
`notes.txt` when there's more to do than paste (stories' link sticker, carousel order), and for
LinkedIn carousels `carousel.pdf` + `pdf-title.txt` (post it as a document). The contact
sheet's last section shows every post with its caption.

`npx tsc --noEmit -p promo` typechecks this folder (`promo/tsconfig.json`).

Needs the Chromium that matches `playwright-core` (`npx playwright-core install chromium` once
on a new machine) and network access to fonts.googleapis.com.
