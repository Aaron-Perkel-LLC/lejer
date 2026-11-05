---
version: 1
slug: "app-globals-css"
primary_target: "app/globals.css"
related_targets: ["lib/theme-tokens.ts","emails/Shell.tsx"]
---

# Japandi theme (the third household theme)

Scope: a third household theme, `japandi`, beside statement and peach, over the same component
set (`app/globals.css` `:root[data-theme="japandi"]`, `lib/theme-tokens.ts`, `emails/Shell.tsx`,
the two theme pickers). Mode: **Operate**. The world lends type, palette, density and one
signature move; layout, navigation and controls stay the system's.

Audience: a household that chose it in Settings or onboarding; the same phone-first, once-a-month
visits as every theme. Job: unchanged (what I owe, check off, post a bill). Constraints: light only
(user-confirmed 2026-10-12); aizome indigo is the one accent (user-confirmed); green/red/amber
stay reserved for paid/unpaid/due-soon; every text pair at or above 4.5:1; the `tokens` verify
suite keeps `lib/theme-tokens.ts`, `globals.css`, DESIGN.md's frontmatter and design.json in step.

## Direction contract

THESIS: The kakeibo, Japan's household account book, kept on an oak desk: linen paper, sumi ink,
one dyed-indigo accent, and more air than either sibling. It refuses "statement without the blue"
(a grey SaaS page with a muted accent) and refuses cream-plus-serif-plus-terracotta, which peach
already owns.

OWN-WORLD: page linen #f0ece4, panel washi #f9f7f2, panel tint oak #e9e3d8, ink sumi #2a2825,
muted #655f56; accent and primary aizome #3f5676 (hover #334862, linen text on it, never white);
paid moss, unpaid persimmon, warn ochre on their washes; rail oak #c9b391. Zen Kaku Gothic New for
body and titles, M PLUS 1 Code for every figure, date, count and eyebrow. Radii 2/4/8. Square tags
with tracked caps. Series: indigo, plum, slate-teal, violet, mauve.

STORY: The visitor opens a calm page that reads like a kept book: the indigo noren at the top, the
figures in a quiet Japanese mono, their own line in the house ledger marked in the ledger's
persimmon (the one unpaid voice; indigo stays interactive-only), PAID stamped as a small inked
seal. They see what they owe and by when, check off, and leave.

FIRST VIEWPORT: The dashboard as the system lays it out: the header bar on washi under the noren
(a 3px oak rod, then 20px of indigo seigaiha cloth), the household name as the wordmark in Zen
Kaku 500, the section links with the current one
inked and underlined in indigo; the greeting as a larger, lighter title; the three-cell summary
strip with figures at M PLUS 1 Code 500; the house ledger and bills table as ruled washi panels on
the linen page with hairlines in translucent sumi. Phone: the same order, the noren still first.

FORM: Brief-pinned world (Japandi), user-chosen over the roll (seed key f7ac058c, assigned index
5, operate). Raises from the dealt hand, each its own line:
- ONE ACCENT OWNS EVERY LIVE STATE (metro typographic tiles): indigo takes focus rings, selection,
  the caret, checked boxes and radios (accent-color), the active link; nothing else is interactive.
- SCALE LEADS, NOT WEIGHT (variable-font specimen): summary figures at 500 not 600; the page title
  larger and lighter (Zen Kaku 500) rather than bolder.
- MEASURE AND RATIO (lexicon shoulder and plate): display 1.6x body (the page title), small
  0.78x (eyebrows and table heads); prose keeps the system's 60ch caps.
- STATE STAMPS ITSELF (jet-age ticket wallet): PAID is a square inked seal mark (1px inset rule in
  the paid colour on its wash, tracked caps), never a pill.
Signature move: the noren, a 20px cloth of `--accent` in seigaiha waves (resist lines in
`--on-primary`) hung from a 3px rod of `--rail` across the very top of the header (mounted on the
existing `.awning` element), echoed as the same rod and cloth over the email masthead (2026-10-12;
it replaced a bare 4px oak rail, which read as too little next to peach's awning).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance

## Accepted by the user (finish review, 2026-10-12)
- The household-name eyebrow over every page title ("7 OAK LANE" over "Bills") and the email's
  "NEW BILL POSTED" eyebrow are the system's page header, shared by all three themes
  (DESIGN.md Typography > Eyebrow). Asked whether to keep it or drop it everywhere, Aaron chose
  "Keep it": the household name belongs over the title so a cold once-a-month visit knows whose
  ledger this is. Japandi restyles it (0.78x, 0.12em) and keeps it; the header's tagline is
  exempt from that size step so the wordmark stays the header's one voice.

## Unresolved
- Whether a sumi-ink dark variant follows later (deferred by the user on 2026-10-12).
