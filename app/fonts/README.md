# Self-hosted faces

Japandi's two faces, as exact latin subsets. Both are Japanese faces (SIL Open Font License,
1.1; each face's `OFL-*.txt` sits beside its files) that Google Fonts serves sliced into
hundreds of unicode-range files, so `next/font/google` would put 6.5 MB of woff2 into the build
even with `subsets: ["latin"]`. These were fetched once from the Google Fonts CSS API with its
`text=` parameter set to printable ASCII, Latin-1 Supplement, and the punctuation the app uses
(dashes, quotes, bullet, ellipsis, →, −, ▾, ✓, €):

- `zen-kaku-gothic-new-{400,500,700}-latin.woff2` — Zen Kaku Gothic New, static instances.
- `m-plus-1-code-latin.woff2` — M PLUS 1 Code, one variable file (weight 400–700).

`app/components/AppShell.tsx` loads them with `next/font/local` (`--nf-zen`, `--nf-mplus`,
`preload: false`). The `tokens` verify suite keeps the set at four files under 120 KB and refuses
either face from `next/font/google`. A glyph outside the subset (a name in another script)
falls back to the system stack in `globals.css`'s `--face-*`.
