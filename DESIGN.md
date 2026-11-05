---
name: Lejer
description: The house ledger — shared bills split, tracked and settled, in four deliberate themes over one component set.
colors:
  # statement (live in app/globals.css :root)
  statement-paper: "#f4f5f6"
  statement-sheet: "#ffffff"
  statement-sheet-tint: "#f8f9fb"
  statement-ink: "#1b2530"
  statement-ink-muted: "#5b6875"
  statement-rule: "rgba(27, 37, 48, 0.16)"
  statement-rule-soft: "rgba(27, 37, 48, 0.08)"
  statement-blue: "#1d5fd6"
  statement-blue-deep: "#174db3"
  statement-blue-wash: "rgba(29, 95, 214, 0.1)"
  statement-on-blue: "#ffffff"
  statement-paid: "#187a4b"
  statement-paid-wash: "rgba(24, 122, 75, 0.12)"
  statement-unpaid: "#c03538"
  statement-unpaid-wash: "rgba(192, 53, 56, 0.1)"
  statement-due-soon: "#8a5b00"
  statement-due-soon-wash: "rgba(216, 146, 0, 0.16)"
  # statement dark (data-color-scheme="system" + prefers-color-scheme: dark)
  statement-dark-paper: "#14181d"
  statement-dark-sheet: "#1b2128"
  statement-dark-sheet-tint: "#20262e"
  statement-dark-ink: "#e4eaf0"
  statement-dark-ink-muted: "#99a5b1"
  statement-dark-blue: "#82abf3"
  statement-dark-button: "#3168d5"
  statement-dark-button-hover: "#2358c4"
  statement-dark-paid: "#52c48a"
  statement-dark-unpaid: "#ee7378"
  statement-dark-due-soon: "#e0b24c"
  # peach: corrected spec, ported in phase 5 (darker inks than the peach app, see Colors > Contrast)
  peach-cream: "#faf3e7"
  peach-paper: "#fffcf7"
  peach-paper-tint: "#f5ead9"
  peach-espresso: "#43302b"
  peach-espresso-muted: "#7a6559"
  peach-rule: "rgba(67, 48, 43, 0.22)"
  peach-rule-soft: "rgba(67, 48, 43, 0.1)"
  peach-deep: "#b45031"
  peach-deep-pressed: "#a34527"
  peach-blush: "rgba(231, 138, 104, 0.16)"
  peach-on-deep: "#fff6ec"
  peach-periwinkle: "#51609e"
  peach-periwinkle-wash: "rgba(95, 111, 174, 0.13)"
  peach-sage: "#406c45"
  peach-sage-wash: "rgba(94, 133, 90, 0.16)"
  peach-rose: "#ae413a"
  peach-rose-wash: "rgba(177, 68, 61, 0.1)"
  peach-butter: "#845e09"
  peach-butter-wash: "rgba(216, 166, 42, 0.2)"
  peach-awning-stripe: "#eb9a76"
  peach-awning-cream: "#f8e3d3"
  # japandi: a kakeibo on an oak desk (light only; every text pair ≥ 4.5:1, see Colors > Contrast)
  japandi-linen: "#f0ece4"
  japandi-washi: "#f9f7f2"
  japandi-oak-tint: "#e9e3d8"
  japandi-sumi: "#2a2825"
  japandi-sumi-muted: "#655f56"
  japandi-rule: "rgba(42, 40, 37, 0.18)"
  japandi-rule-soft: "rgba(42, 40, 37, 0.09)"
  japandi-indigo: "#3f5676"
  japandi-indigo-deep: "#334862"
  japandi-indigo-wash: "rgba(63, 86, 118, 0.12)"
  japandi-on-indigo: "#f4f1ea"
  japandi-moss: "#4a6539"
  japandi-moss-wash: "rgba(74, 101, 57, 0.14)"
  japandi-persimmon: "#a8352a"
  japandi-persimmon-wash: "rgba(168, 53, 42, 0.1)"
  japandi-ochre: "#785409"
  japandi-ochre-wash: "rgba(120, 84, 9, 0.14)"
  japandi-oak-rail: "#c9b391"
  # sheet: the public site's drafting sheet as a household theme (light only)
  sheet-paper: "#f3f5f4"
  sheet-highlight: "#fbfcfb"
  sheet-hatch: "#e9ebea"
  sheet-ink: "#111315"
  sheet-ink-2: "#4a5056"
  sheet-rule: "rgba(17, 19, 21, 0.2)"
  sheet-rule-soft: "rgba(17, 19, 21, 0.1)"
  sheet-accent: "#111315"
  sheet-ink-hover: "#2b3036"
  sheet-highlighter: "rgba(242, 196, 0, 0.42)"
  sheet-on-ink: "#fbfcfb"
  sheet-paid: "#15733a"
  sheet-paid-wash: "rgba(21, 115, 58, 0.12)"
  sheet-unpaid: "#c4221a"
  sheet-unpaid-wash: "rgba(196, 34, 26, 0.1)"
  sheet-due-soon: "#785600"
  sheet-due-soon-wash: "rgba(120, 86, 0, 0.14)"
  sheet-grid: "rgba(17, 19, 21, 0.045)"
  # chart series (trends only; never interactive, never status). See Colors > Data series.
  statement-series-1: "#1d5fd6"
  statement-series-2: "#8c2f6e"
  statement-series-3: "#2e9fd0"
  statement-series-4: "#5b3fa8"
  statement-series-5: "#c2418f"
  statement-dark-series-1: "#4f86e8"
  statement-dark-series-2: "#b4508f"
  statement-dark-series-3: "#3aa0d0"
  statement-dark-series-4: "#7f66d8"
  statement-dark-series-5: "#d465a5"
  peach-series-1: "#b45031"
  peach-series-2: "#51609e"
  peach-series-3: "#9a3f6b"
  peach-series-4: "#3e5fb0"
  peach-series-5: "#c06090"
  japandi-series-1: "#3858a8"
  japandi-series-2: "#a03a6a"
  japandi-series-3: "#1f8fc2"
  japandi-series-4: "#6a4ec4"
  japandi-series-5: "#c95a93"
  sheet-series-1: "#1b5ecf"
  sheet-series-2: "#d6231b"
  sheet-series-3: "#b58500"
  sheet-series-4: "#7b4fc9"
  sheet-series-5: "#ec6612"
typography:
  statement-page-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  statement-body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  statement-figure-lg:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.7rem"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "tnum"
  statement-figure:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
  statement-eyebrow:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.7rem"
    fontWeight: 500
    letterSpacing: "0.14em"
  statement-label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
  peach-page-title:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "1.6rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  peach-display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "1.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  peach-body:
    fontFamily: "Karla, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  peach-figure:
    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
  peach-eyebrow:
    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.16em"
  japandi-page-title:
    fontFamily: "'Zen Kaku Gothic New', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  japandi-body:
    fontFamily: "'Zen Kaku Gothic New', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  japandi-figure-lg:
    fontFamily: "'M PLUS 1 Code', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.7rem"
    fontWeight: 500
    lineHeight: 1.25
    fontFeature: "tnum"
  japandi-figure:
    fontFamily: "'M PLUS 1 Code', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
  japandi-eyebrow:
    fontFamily: "'M PLUS 1 Code', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.78rem"
    fontWeight: 500
    letterSpacing: "0.12em"
  japandi-wordmark:
    fontFamily: "'Zen Kaku Gothic New', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 500
    letterSpacing: "-0.01em"
  sheet-page-title:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 800
    fontStretch: "108%"
    lineHeight: 1.08
    letterSpacing: "-0.024em"
  sheet-wordmark:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 800
    fontStretch: "118%"
    letterSpacing: "-0.02em"
  sheet-body:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  sheet-figure-lg:
    fontFamily: "'Martian Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.7rem"
    fontWeight: 600
    fontStretch: "87.5%"
    lineHeight: 1.25
    fontFeature: "tnum"
  sheet-figure:
    fontFamily: "'Martian Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontStretch: "87.5%"
    fontFeature: "tnum"
  sheet-eyebrow:
    fontFamily: "'Martian Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.66rem"
    fontWeight: 500
    fontStretch: "87.5%"
    letterSpacing: "0.06em"
rounded:
  statement-sm: "4px"
  statement-md: "6px"
  statement-lg: "10px"
  peach-sm: "6px"
  peach-md: "10px"
  peach-lg: "14px"
  japandi-sm: "2px"
  japandi-md: "4px"
  japandi-lg: "8px"
  sheet-sm: "0px"
  sheet-md: "0px"
  sheet-lg: "0px"
  pill: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "20px"
  page-y: "32px"
  panel-x: "20px"
  panel-y: "16px"
  cell-x: "16px"
  cell-y: "12px"
  container: "1000px"
components:
  statement-button-primary:
    backgroundColor: "{colors.statement-blue}"
    textColor: "{colors.statement-on-blue}"
    rounded: "{rounded.statement-md}"
    padding: "8px 14px"
    height: "36px"
  statement-button-primary-hover:
    backgroundColor: "{colors.statement-blue-deep}"
  statement-button:
    backgroundColor: "{colors.statement-sheet}"
    textColor: "{colors.statement-ink}"
    rounded: "{rounded.statement-md}"
    padding: "8px 14px"
    height: "36px"
  statement-tag-paid:
    backgroundColor: "{colors.statement-paid-wash}"
    textColor: "{colors.statement-paid}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-tag-unpaid:
    backgroundColor: "{colors.statement-unpaid-wash}"
    textColor: "{colors.statement-unpaid}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-due-soon:
    backgroundColor: "{colors.statement-due-soon-wash}"
    textColor: "{colors.statement-due-soon}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-field:
    backgroundColor: "{colors.statement-sheet}"
    textColor: "{colors.statement-ink}"
    rounded: "{rounded.statement-md}"
    padding: "8px 12px"
  statement-panel:
    backgroundColor: "{colors.statement-sheet}"
    rounded: "{rounded.statement-md}"
  peach-button-primary:
    backgroundColor: "{colors.peach-deep}"
    textColor: "{colors.peach-on-deep}"
    rounded: "{rounded.peach-md}"
    padding: "8px 14px"
    height: "36px"
  peach-button-primary-hover:
    backgroundColor: "{colors.peach-deep-pressed}"
  peach-tag-paid:
    backgroundColor: "{colors.peach-sage-wash}"
    textColor: "{colors.peach-sage}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-tag-unpaid:
    backgroundColor: "{colors.peach-rose-wash}"
    textColor: "{colors.peach-rose}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-due-soon:
    backgroundColor: "{colors.peach-butter-wash}"
    textColor: "{colors.peach-butter}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-panel:
    backgroundColor: "{colors.peach-paper}"
    rounded: "{rounded.peach-md}"
  japandi-button-primary:
    backgroundColor: "{colors.japandi-indigo}"
    textColor: "{colors.japandi-on-indigo}"
    rounded: "{rounded.japandi-md}"
    padding: "8px 14px"
    height: "36px"
  japandi-button-primary-hover:
    backgroundColor: "{colors.japandi-indigo-deep}"
  japandi-tag-paid:
    backgroundColor: "{colors.japandi-moss-wash}"
    textColor: "{colors.japandi-moss}"
    rounded: "{rounded.japandi-sm}"
    padding: "2px 8px"
    border: "1px inset ring, {colors.japandi-moss}"
  japandi-tag-unpaid:
    backgroundColor: "{colors.japandi-persimmon-wash}"
    textColor: "{colors.japandi-persimmon}"
    rounded: "{rounded.japandi-sm}"
    padding: "2px 8px"
  japandi-due-soon:
    backgroundColor: "{colors.japandi-ochre-wash}"
    textColor: "{colors.japandi-ochre}"
    rounded: "{rounded.japandi-sm}"
    padding: "2px 8px"
  japandi-panel:
    backgroundColor: "{colors.japandi-washi}"
    rounded: "{rounded.japandi-md}"
  japandi-rail:
    backgroundColor: "{colors.japandi-oak-rail}"
    height: "4px"
  sheet-button-primary:
    backgroundColor: "{colors.sheet-ink}"
    textColor: "{colors.sheet-on-ink}"
    rounded: "{rounded.sheet-md}"
    border: "1.5px solid {colors.sheet-ink}"
    padding: "8px 14px"
    height: "36px"
  sheet-button-primary-hover:
    backgroundColor: "{colors.sheet-ink-hover}"
  sheet-button:
    backgroundColor: "{colors.sheet-highlight}"
    textColor: "{colors.sheet-ink}"
    rounded: "{rounded.sheet-md}"
    border: "1.5px solid {colors.sheet-ink}"
    padding: "8px 14px"
    height: "36px"
  sheet-tag-paid:
    backgroundColor: "{colors.sheet-paid-wash}"
    textColor: "{colors.sheet-paid}"
    rounded: "{rounded.sheet-sm}"
    padding: "2px 6px"
    border: "1px inset ring, currentColor at 35%"
  sheet-tag-unpaid:
    backgroundColor: "{colors.sheet-unpaid-wash}"
    textColor: "{colors.sheet-unpaid}"
    rounded: "{rounded.sheet-sm}"
    padding: "2px 6px"
  sheet-due-soon:
    backgroundColor: "{colors.sheet-due-soon-wash}"
    textColor: "{colors.sheet-due-soon}"
    rounded: "{rounded.sheet-sm}"
    padding: "2px 6px"
  sheet-field:
    backgroundColor: "{colors.sheet-highlight}"
    textColor: "{colors.sheet-ink}"
    rounded: "{rounded.sheet-md}"
    border: "1.5px solid {colors.sheet-ink}"
    padding: "8px 12px"
  sheet-panel:
    backgroundColor: "{colors.sheet-highlight}"
    rounded: "{rounded.sheet-md}"
    border: "1px solid {colors.sheet-rule}"
  sheet-grid:
    backgroundColor: "{colors.sheet-grid}"
    size: "24px"
---

# Design System: Lejer

## Overview

**Creative North Star: "The House Ledger"**

There is one ledger for the house, kept in one of four hands. **Statement** is the bank's
printout: a grey page, white sheets, a single blue, and IBM Plex Mono on every figure, date and
label, so the screen reads like the portal your utility company wishes it had. **Peach** is the
book kept on the porch: cream paper under a striped peach awning with a scalloped hem, Fraunces
for display, Karla for body text, and Courier Prime typing the figures in. **Japandi** is the
kakeibo kept on an oak desk: linen paper, washi panels, sumi ink, one dyed-indigo accent, Zen
Kaku Gothic New for body and titles, M PLUS 1 Code for every figure, and a noren along the top
of the page: an indigo cloth in seigaiha waves, hung from a 3px oak rod. **Sheet** is the house's own drafting sheet: the public site's world (see
Public Site: The Drafting Sheet, below) worn by a household. Ink on a cool white sheet under a
24px grid, ink as the one accent with the highlighter as its wash, Archivo set wide and heavy for
titles, Martian Mono condensed for every figure, square everything and 1.5px ink frames. All
four share the same components, the same layout and the same rules for money. The theme changes
the hand, never the record.

The feel is **friendly and sturdy**. Surfaces are flat paper divided by hairline rules, with
comfortable tap targets and soft corners. Nothing floats, glows or competes with the numbers.
The density is that of a well-kept statement: a summary strip of three figures, then ruled
tables that reflow into small ledger cards on a phone. Most visits happen on a phone, cold, once
a month, so every screen opens with what's owed and by when, and offers one obvious thing to do.

Theme differences are design, not inconsistency. Never "fix" one theme toward another.
Fraunces and the awning are deliberate, and so are japandi's lighter weights and its one rail,
and the sheet's square corners, grid and ink frames.

**Key Characteristics:**
- Four themes, one component set, switched by `<html data-theme>` from the household's settings.
- Every number, date, count and section label is set in the theme's ledger monospace with tabular figures.
- One accent per theme (statement blue, deep peach, aizome indigo, and in sheet ink itself with the highlighter as its wash). Peach adds periwinkle as a quiet second voice.
- Green, red and amber (sage, rose and butter in peach; moss, persimmon and ochre in japandi; the sheet's own inked steps) mean paid, unpaid and due soon, and nothing else.
- Flat surfaces with hairline borders. Shadows only on things that float.
- Statement supports dark mode. Peach, japandi and sheet are light-only on purpose.
- One signature move per theme: peach's awning, japandi's noren, the sheet's 24px drafting grid on the page. Statement has none.

## Colors

Each theme is a restrained paper palette: ink on paper, one accent, and three status colors kept
strictly for status. The sheet goes furthest: its accent is the ink itself.

### Primary
- **Statement Blue** (`statement-blue`): links, the active nav underline, focus rings, and solid
  primary buttons. Its deep step (`statement-blue-deep`) is the hover state, and its wash
  (`statement-blue-wash`) tints the demo banner and selection. In dark mode, links and focus use
  the lighter `statement-dark-blue` while buttons keep the saturated `statement-dark-button` so
  white text still reads. Hover goes deeper in both modes, never lighter: there's no room
  above the dark button for a visibly lighter blue that still carries white text.
- **Deep Peach** (`peach-deep`): the same role in peach. It's a burnt, terracotta-leaning peach
  that carries cream text (`peach-on-deep`), never pure white. It's one step darker than
  the peach app's original, so cream text and links both clear 4.5:1 (see Contrast). Hover deepens to
  `peach-deep-pressed`, and `peach-blush` is the soft accent wash.
- **Aizome Indigo** (`japandi-indigo`): the same role in japandi, a dyed, greyed indigo that
  carries linen text (`japandi-on-indigo`), never white. It is the theme's only interactive
  color: links, the active nav underline, focus rings, selection, the caret, checked boxes and
  radios, and the one primary button. Hover deepens to `japandi-indigo-deep`;
  `japandi-indigo-wash` tints the chosen choice card and the demo banner. It never appears as a
  status, a fill or a heading color, and it is deliberately too grey to chart (see Data series).
- **Ink as the accent** (`sheet-accent`, the same value as `sheet-ink`): the sheet has no
  colored accent. Links, the active nav underline, focus rings, the caret, checked controls and
  the primary button (`sheet-ink` fill, `sheet-on-ink` text, hovering to `sheet-ink-hover`) are
  all ink. Its wash is the **Highlighter** (`sheet-highlighter`, a translucent yellow): it
  marks selected text and nothing else. A chosen choice card or a pressed legend option does
  not take the wash; it takes the site's own chosen state (panel ground, ink border, a 3px ink
  rule along the bottom).

### Secondary
- **Periwinkle** (`peach-periwinkle`, peach only): the second voice, used for informational
  tags that are not money status. Statement and japandi have no secondary accent and should not gain one.

### Tertiary
- **Awning Stripe and Awning Cream** (`peach-awning-stripe`, `peach-awning-cream`, peach only):
  the cabana stripes. They appear only in the awning, the slim striped panel edge, and the email
  masthead stripe, never as fills, text or status.
- **Oak Rail** (`japandi-oak-rail`, japandi only): a pale oak. It is the 3px rod the noren hangs
  from, across the very top of the header, above the email masthead, and on japandi's theme
  swatch. Never a fill, a border, text or status. The noren itself is drawn in tokens the theme
  already has: the indigo accent as the dye, the on-indigo linen as the resist lines.
- **Drafting Grid** (`sheet-grid`, sheet only): ink at 4.5%, drawn as 1px lines every 24px in
  both directions on the page body (and on the sheet's theme swatch). It is the sheet's one
  signature move and lives on the page ground only: panels, fields and the header sit on it
  unlined, and nothing else is gridded.

### Neutral
- **Statement Paper / Sheet / Sheet Tint** (`statement-paper`, `statement-sheet`,
  `statement-sheet-tint`): the grey page, white panels and inputs, and the faint fill used for
  quiet chips and skeletons. Dark mode swaps in graphite equivalents
  (`statement-dark-paper` / `-sheet` / `-sheet-tint`).
- **Statement Ink / Ink Muted** (`statement-ink`, `statement-ink-muted`): a blue-black for body
  text and figures, and slate for eyebrows, captions and secondary cells.
- **Statement Rule / Rule Soft**: translucent ink at 16% for table header rules and input
  borders, and at 8% for row dividers and panel outlines.
- **Peach Cream / Paper / Paper Tint** (`peach-cream`, `peach-paper`, `peach-paper-tint`): the
  warm page, the panel sheet, and the tan tint for quiet chips.
- **Espresso / Espresso Muted** (`peach-espresso`, `peach-espresso-muted`): a warm brown-black
  ink and a cocoa grey. Rules are translucent espresso at 22% and 10%.
- **Linen / Washi / Oak Tint** (`japandi-linen`, `japandi-washi`, `japandi-oak-tint`): the warm
  grey-beige page, the off-white panel and input sheet, and the oak-tinted fill for quiet chips
  and skeletons. Linen is also the browser `theme-color` for a japandi household.
- **Sumi / Sumi Muted** (`japandi-sumi`, `japandi-sumi-muted`): a soft, warm black ink and a
  taupe for eyebrows, captions and secondary cells. Rules are translucent sumi at 18% and 9%.
- **Drafting Sheet / Sheet Highlight / Sheet Hatch** (`sheet-paper`, `sheet-highlight`,
  `sheet-hatch`): the cool white page under the grid (also the browser `theme-color` for a sheet
  household), the near-white panel, field and dialog ground, and the hatch-grey fill for
  skeletons. Quiet chips do not use the hatch in sheet: they are drawn boxes (see Components >
  Tags).
- **Ink / Ink 2** (`sheet-ink`, `sheet-ink-2`): the site's near-black for body text, figures,
  every frame and the primary button, and its grey for eyebrows, captions and secondary cells.
  Rules are translucent ink at 20% (panel outlines, table header rules, neutral chip rings,
  icon buttons) and 10% (row dividers); frames are 1.5px of solid ink.

### Status
- **Statement:** paid green (`statement-paid`), unpaid red (`statement-unpaid`) and due-soon
  amber (`statement-due-soon`), each paired with a wash for its tag or chip background.
- **Peach:** sage (`peach-sage`), rose (`peach-rose`) and butter (`peach-butter`), with their
  washes.
- **Japandi:** moss (`japandi-moss`), persimmon (`japandi-persimmon`) and ochre
  (`japandi-ochre`), with their washes. Persimmon is the one place the page raises its voice:
  the viewer's "You" in the house ledger, a late caption, and UNPAID once past due.
- **Sheet:** the sheet's inked steps, `sheet-paid`, `sheet-unpaid` and `sheet-due-soon`, with
  their washes. They are deeper, text-grade cousins of the site's locate colours (which stay
  chart lines, see Data series), chosen so each clears 4.5:1 on its wash over the page and the
  panel. Every sheet tag also carries a 1px ring of its own ink at 35%, so a status reads as a
  drawn box as much as a tinted one.

### Data series
Charts (trends) get five series colors per theme and per statement mode, `*-series-1` to
`*-series-5` in the frontmatter. They're data, not interface: never a link, a button, a fill
or a status. Slot 1 is the theme's accent (in japandi, the accent's chart-grade step: aizome
itself is too grey for a 2px line) and the rest avoid the status hues entirely, so a line never
reads as paid, unpaid or due soon. The sheet is the stated exception: its accent is ink, which
no line can be, and its world *is* the four utility lines, so its slots are the site's locate
colours (water, electric, gas darkened to chart grade, wifi) plus a violet, while its status
inks are their own deeper steps. Bill types take slots in the order they were
created and keep them as data changes or as lines are toggled. A sixth type onward folds into
"Other" in muted ink and a dotted stroke, never a generated sixth hue.
- **Statement:** blue, plum, sky, violet, magenta.
- **Statement dark:** the same hues, stepped for the graphite sheet.
- **Peach:** deep peach, periwinkle, plum, cobalt, orchid.
- **Japandi:** indigo, plum, sky, violet, orchid.
- **Sheet:** water, electric, gas, violet, wifi (`sheet-series-1` to `-5`).

Each palette passes the dataviz validator against its own panel: lightness band, chroma
floor, protanopia and deuteranopia separation between neighboring slots (8.8 or better), and
3:1 against the panel. Without orange, green or yellow no set of four hues stays apart for
every pair, so identity never rests on color alone. (The sheet's electric and gas sit in the
protan/deutan floor band of that validator, legal for the same reason.) Each slot has its own point shape, the
legend is a row of labelled toggle buttons, lines are named at their last point when four or
fewer show, and the tooltip names every value.

### Named Rules
**The Reserved Semantics Rule.** Green, red and amber (sage, rose and butter) belong to paid,
unpaid and due soon (overdue reads as unpaid). Never use them for decoration, branding or
generic success and error. The one exception is flash messages, which borrow the paid and unpaid
washes for ok and err.

**The One Accent Rule.** Each theme has exactly one interactive color. If something is
clickable and not a status, it is the accent or it is ink. In japandi that color is aizome
indigo, and it is interactive-only: no heading, figure, fill or decoration borrows it. In sheet
the accent is ink itself, so clickable and ink are the same thing. Series colors are data and never
clickable; the legend toggle that shows or hides a line is ink, with the series drawn in its swatch.

**The Highlighter Rule.** The sheet's one colour outside status and charts, the yellow
highlighter, marks selected text only. It never fills a chosen card, a pressed toggle, a banner
or a hover; those take the ink border and the 3px ink rule instead.

**The Calm Red Rule.** Unpaid and overdue use the soft wash with colored text, never a solid red
block. Owing money is information, not an alarm.

### Contrast
Every text pair clears 4.5:1 (WCAG AA for body text). Peach's inks are a **corrected spec**:
phase 5 ports the values in this file, not the peach app's originals, which failed. Each fix only
darkens the ink, keeping its hue; surfaces and washes are unchanged. Status tags are measured
against their wash flattened onto each surface.

| Peach pair | On cream page | On panel | peach app original (page / panel) |
|---|---|---|---|
| Espresso muted (eyebrows, captions) | 4.97 | 5.35 (4.61 on paper tint) | 3.98 / 4.29 (3.69) |
| Deep peach as link text | 4.61 | 4.97 | 4.31 / 4.65 |
| Cream on deep peach (primary button) | 4.75 (5.71 on hover) | | 4.45 |
| Sage on its wash (PAID) | 4.60 | 4.94 | 3.76 / 4.03 |
| Rose on its wash (UNPAID, overdue) | 4.61 | 4.93 | 4.43 / 4.74 |
| Butter on its wash (due soon) | 4.65 | 4.94 | 4.26 / 4.53 |
| Periwinkle on its wash (info) | 4.64 | 4.98 | 3.73 / 4.00 |

Series colors are marks, not text, and each clears 3:1 against its own panel (statement
light, statement dark, peach, japandi and sheet).

Japandi was measured the same way at the build, over the linen page, the washi panel and the
oak tint (tags on their wash flattened onto page and panel). Nothing needed correcting: the
sumi inks were chosen dark and the status inks are a step deeper than peach's.

| Japandi pair | On linen page | On washi panel | On oak tint |
|---|---|---|---|
| Sumi (body, figures) | 12.48 | 13.73 | 11.51 |
| Sumi muted (eyebrows, captions) | 5.36 | 5.90 | 4.95 |
| Aizome as link text | 6.36 | 6.99 | 5.86 |
| Linen on aizome (primary button) | 6.64 (8.30 on hover) | | |
| Moss on its wash (PAID seal) | 4.59 | 5.04 | |
| Persimmon on its wash (UNPAID, overdue) | 4.81 | 5.27 | |
| Ochre on its wash (due soon) | 4.78 | 5.20 | |

The sheet was measured at the build over the page, the panel and the hatch (tags on their wash
flattened onto page and panel). Its inks are the site's, unchanged; its three status inks are
new, chosen a step deeper than the locate colours so they read as text.

| Sheet pair | On sheet page | On panel | On hatch |
|---|---|---|---|
| Ink 2 (eyebrows, captions) | 7.45 | 7.94 | 6.82 |
| Sheet highlight on ink (primary button) | 18.1 | | |
| Paid on its wash (PAID) | 4.56 | 4.87 | |
| Unpaid on its wash (UNPAID, overdue) | 4.55 | 4.84 | |
| Due soon on its wash | 5.02 | 5.32 | |

Statement light pairs measure 5.2:1 or better on page and panel. Its status tags measure at
least 4.53:1 on their washes over the panel, where tags live. Statement dark pairs measure
4.79:1 or better. White text on the dark button measures 5.16:1, and 6.43:1 on its hover. The
hover used to be a lighter `#4478e2` at 4.17:1. It now goes deeper instead, which closes the
last known gap.

**The Change It Once Rule.** Theme colors live in `lib/theme-tokens.ts`. Emails import them,
and `npm run verify` (the `tokens` suite) fails if `app/globals.css`, this file's frontmatter
or `.impeccable/design.json` disagrees. Change the module first, then the others.

## Typography

**Statement:** system UI sans for body text and IBM Plex Mono (400/500/600) as the ledger face.
**Peach:** Karla (400–700) for body text, Fraunces (400–600, italic available) for display, and
Courier Prime (400/700) as the ledger face.
**Japandi:** Zen Kaku Gothic New (400/500/700) for body text and titles alike, and M PLUS 1 Code
(variable, 400–700) as the ledger face. Both are self-hosted as exact latin subsets in
`app/fonts/` (Google slices these Japanese faces into hundreds of files), loaded with
`next/font/local`, never preloaded, and the `tokens` suite keeps the set at four files under
120 KB. A glyph outside the subset falls back to the system stack.
**Sheet:** Archivo (variable, with its width axis) for body text, titles and buttons, and
Martian Mono (variable, with its width axis) as the ledger face. Both come from `next/font/google`
in `app/site-fonts.ts`, the one declaration the public site, the 404 and the sheet theme all
import, so the build emits one file each and a visitor arriving from the site has them already.
Martian Mono is the one face in the system that preloads (sheet is the default theme); Archivo
has `preload: false`.

**Character:** Statement pairs a neutral system sans with a crisp engineering mono, like a bank
portal printout. Peach pairs a soft, round grotesque with a warm old-style display serif and a
typewriter, like a ledger typed up and titled by hand. Japandi uses one quiet Japanese gothic
for everything that is words and a quiet Japanese mono for everything that is numbers, like a
kakeibo kept in one careful hand: hierarchy comes from size and air, not weight. The sheet is
a drawing: Archivo pulled wide and heavy names the thing, Martian Mono pulled narrow dimensions
it, and nothing in between.

### Hierarchy
- **Page title:** statement uses the sans at 700, 1.25rem, tight tracking. Peach uses Fraunces
  at 600, 1.6rem, tracking -0.01em. Japandi uses Zen Kaku at 500, 1.6rem, tracking -0.01em,
  line-height 1.25: larger and lighter, never bolder. Sheet uses Archivo at 800, 1.8rem, 108%
  width, tracking -0.024em, line-height 1.08: the site's H2 voice. One per page, usually a greeting ("Hi,
  {name}") or the section name, with the household name as an eyebrow above it on section
  pages.
- **Display** (peach only; Fraunces 600, about 1.875rem): hero moments such as empty states.
- **Summary figure** (ledger mono at 600, 1.7rem, line-height 1.25, tabular; japandi at 500;
  sheet condensed to 87.5% width): the three numbers in the dashboard strip (you owe or owed to
  you, next due, bills on record). Every sheet figure, table cell and chip is at 87.5%.
- **Body** (sans, root size clamp(15px, 1vw + 12px, 16px), line-height 1.55): prose, table
  cells at 0.875rem, and captions at 0.75rem in muted ink.
- **Eyebrow** (ledger mono, 0.7rem, uppercase; statement 500 weight with 0.14em tracking, peach
  700 with 0.16em): titles every block and every table header (0.68rem, 0.12em/0.14em). Japandi
  sets eyebrows and table headers alike one small step below body, 0.78rem at 500 with 0.12em,
  except the header's tagline, which keeps the system's 0.7rem so the wordmark stays the
  header's one voice. Sheet sets eyebrows and table headers alike in Martian Mono at 0.66rem,
  500, 87.5% width with 0.06em tracking: the site's drawing-annotation size, tighter than any
  other theme's.
- **Field label** (sans 600, 0.82rem): above every input.
- **Wordmark** (ledger mono 600, 0.8rem, uppercase, 0.14em): the household name in the
  statement nav. Peach sets it in Fraunces 600 at 1.125rem; japandi in Zen Kaku 500 at 1.05rem,
  mixed case, tracking -0.01em; sheet in Archivo 800 at 1.15rem, 118% width, mixed case,
  tracking -0.02em, the site's own wordmark.
- **Button label** (sans 500, 0.875rem; sheet Archivo 650 at 106% width): every button.

### Named Rules
**The Ledger Face Rule.** Every number, amount, date, count and section label is set in the
theme's ledger monospace with tabular figures (the `.figure` / `.eyebrow` voice). Prose never is.
If a value can be added up or put on a calendar, it is monospace.

**The Right-Edge Rule.** Amount columns are right-aligned so the decimal points line up.

**The Scale Leads Rule.** Japandi never reaches for a heavier weight to make a thing
important. The page title is 1.6x body at 500, summary figures are 500 where the other themes
use 600, and the small step (eyebrows, table heads) is 0.78x body. Size and air carry the
hierarchy; 700 exists in the face but the system does not use it.

**The Width Axis Rule.** The sheet's hierarchy is width as much as weight. Words that name
(titles 108%, the wordmark 118%, buttons 106%) go wide in Archivo; things that measure
(figures, eyebrows, table heads, chips, 87.5%) go narrow in Martian Mono. Nothing on the sheet
is set at the faces' default width.

## Layout

The layout is a single centered column with a maximum width of 1000px, a 16px gutter (20px from
`sm`), and 32px of vertical page padding (40px in japandi, one step airier). The header is a 52px bar (56px in peach, plus the
awning; in japandi, under the 4px rail; in sheet, closed by a 1.5px ink rule instead of the
soft one), and the footer is a hairline-topped strip with the household name in mono and the
household's reply-to address.

The dashboard rhythm is a page title, a muted "{household} as of {date}" line, a summary panel
split into three equal cells (stacked with horizontal rules on a phone, side by side with
vertical rules from `sm`), and then ruled tables grouped under eyebrows. Panel cells pad 20px by
16px, and table cells 16px by 12px (12px horizontally on a phone).

**Responsive:** the one breakpoint that changes structure is `sm` (640px). Below it, any
`.table-stack` table drops its header and reflows each row into a small ledger card, a CSS grid
with named areas (bill and amount on top, then due date, status and actions; the bills page's,
which carry check-offs and up to four row actions, put the check-offs and then the actions on
rows of their own), so nothing ever scrolls sideways. Inputs are 16px below `sm` so iOS doesn't zoom on focus. Coarse pointers get
36px icon buttons.

**The No Sideways Scroll Rule.** A phone never scrolls horizontally. New tables join the
`.table-stack` system with their own grid-template-areas instead of overflowing.

## Elevation & Depth

The system is flat. Depth comes from tone (the sheet on the paper, the sheet tint inside the
sheet) and from hairline rules, not shadows. Shadows appear only on layers that genuinely float
above the page. The sheet has no shadows at all, even on those: its dialog and phone menu are
separated from the ground by a 1.5px ink frame, the way the site's sheet is separated from the
page.

### Shadow Vocabulary
- **Dropdown** (`--shadow-dropdown`: `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 /
  0.1)`): the header's name menu and the phone menu, the only two layers that float under the
  header.
- **Dialog** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`):
  modal panels such as editing a bill, a bill type or a document.
- **Sheet:** none. Both of the above are replaced by `border: 1.5px solid` ink and
  `box-shadow: none` under `[data-theme="sheet"]`.

### Named Rules
**The Flat Paper Rule.** Panels, cards, tables and buttons have no shadow at rest or on hover.
If it doesn't float over other content, it doesn't cast a shadow.

## Shapes

Corners are soft but small, like a trimmed sheet, not a bubble. Statement steps 4, 6 and 10px,
peach steps 6, 10 and 14px, and japandi steps 2, 4 and 8px, so peach reads one notch rounder
and japandi one notch crisper throughout. The sheet's three steps are all 0px: nothing on it
is rounded, not a button, a field, a tag, a panel or the dialog. Panels, buttons and inputs use the middle step. Tags
and due chips use the small step in statement, become **full pills** in peach, are
near-square in japandi (2px), where PAID is also ringed as a seal, and are square in sheet,
where every tag is ringed in its own ink at 35% and the neutral ones are drawn in rule colour
with no fill (see Components > Tags). Borders are 1px hairlines in translucent ink, and active nav and tab
states are a 2px accent underline, not a filled pill. The sheet draws its borders heavier
where the site does: 1.5px of solid ink around buttons, fields, the header's bottom edge, the
dialog, the phone menu and the page's one framed panel; panels and icon buttons keep the 1px
hairline at 20% ink.

**The awning** is peach's signature silhouette: a 10px band of 14px peach and cream stripes
across the top of the page, finished with a 7px scalloped hem drawn by two offset radial
gradients. It sits once, at the very top of the header, with its hem hanging over the bar. A slimmer cousin, `.panel-awning`, gives a panel a
6px striped top edge with no scallop.

**The noren** is japandi's signature silhouette, mounted on the same `.awning` element: a 20px
indigo cloth patterned in seigaiha (blue ocean waves, five radial gradients tiled at 40×20px,
`seigaiha()` in `lib/theme-tokens.ts`; the dye is `japandi-indigo`, the resist lines
`japandi-on-indigo`), hung from a 3px oak rod (`japandi-oak-rail`) across the very top of the
header. No hem. It is the first thing on every japandi page and in the email (where a client
that drops background images shows flat indigo under the rod), and the theme's only
decorative move; there is no japandi `.panel-awning`.

**The drafting grid** is the sheet's signature, and it is mounted on the page body, not on the
header: two 1px line gradients in `sheet-grid` repeating every 24px, so the whole page is
graph paper and every panel sits on it as a sheet on a drafting table. There is no sheet
`.awning`, `.panel-awning` or rail; the `.awning` element renders nothing in this theme. Above
the grid, one thing per page is framed in 1.5px ink (`.panel-primary`): the summary strip on
the dashboard, "Still owed" on the bills page, the members panel on Household. Everything
else is hairlined.

## Components

### Buttons
Friendly and sturdy: a comfortable height, soft corners, and plain sans labels.
- **Shape:** the middle radius (6px statement, 10px peach, 4px japandi, 0 in sheet), a minimum
  height of 36px, and 8px by 14px padding at 0.875rem/500 (sheet: Archivo 650 at 106% width).
- **Primary:** an accent fill with white text in statement, cream (`peach-on-deep`) in peach,
  linen (`japandi-on-indigo`) in japandi and sheet highlight (`sheet-on-ink`) on an ink fill in
  sheet. Hover moves to the deep step (`sheet-ink-hover` in sheet). Use one per screen, for the screen's obvious action.
- **Default:** sheet background, 1px rule border and ink text. On hover the border darkens to
  40% ink. In sheet every button, default and primary alike, carries a 1.5px solid ink border,
  so the default button is the site's "line" button: a drawn box with ink text.
- **Small** (28px min, 4px by 10px padding, 0.8rem): for inline row actions only.
- **Icon** (28px square, 36px on touch): a transparent background with a soft rule and muted
  icon (sheet keeps the icon button at the 20% rule, not the 1.5px frame). It turns ink on hover. Phones have no hover titles, so in a phone card's action row the
  bills page's remind and edit buttons widen to carry their word ("Remind", "Edit").
- **Focus:** a 2px accent outline offset by 2px on every button. **Disabled:** 60% opacity with
  the default cursor.
- **Motion:** colors transition in 100ms and nothing moves.

### Tags and Due Chips
- **Status tags** (`StatusTag`): one vocabulary everywhere, PAID or UNPAID, for owners and
  debtors alike. Ledger mono at 0.7rem, uppercase, 0.08em tracking. PAID is the paid color on
  its wash; UNPAID is the unpaid color on its wash **only once the bill is past due**. Before
  that it's the neutral open tag (`.tag-open`: sheet tint, muted ink), so red always means late
  and an owner's open bills never look alarming. Square-cornered (4px) in statement, bold pills
  in peach, and near-square (2px) with 8px side padding and 0.1em tracking in japandi, where
  **PAID is a seal**: the moss wash plus a 1px inset ring in moss (`box-shadow: inset 0 0 0 1px
  var(--paid)`), the only japandi tag with a ring, so a paid row reads as stamped. UNPAID and the due
  chips stay unringed. In sheet every tag is square, 500 weight, condensed to 87.5%, and ringed
  1px inset in its own text colour at 35% (`color-mix(in srgb, currentColor 35%, transparent)`)
  over its wash, so PAID, UNPAID and the due chips all read as drawn boxes; the neutral ones
  (`.tag-open`, `.due-paid`, `.due-future`) drop the fill entirely and take a 1px ring in the
  20% rule colour. Tone comes from line, never tint.
- **Due chips** (`DueChip`): ledger mono at 0.7rem with tabular figures, rendered on the server
  from the **household's** today and its urgent window (`urgent_reminder_days`), the same rules
  as the reminder emails, never the device's date. Neutral when paid or in the future,
  butter/amber within the urgent window, rose/red when overdue. The visible "Oct 5 • Past due
  2d" is shorthand; screen readers get the sentence ("Due Oct 5, past due by 2 days").
- 0.7rem is the floor for tags anywhere, swatches included.

### Cards / Containers
- **Panel:** a sheet background, a 1px soft rule, and the middle radius with no shadow. Panels
  hold the summary strip, every table, and every form.
- **Internal padding:** 20px by 16px for summary cells, while table panels let the cells pad
  themselves.
- **Peach awning panel:** an optional striped 6px top edge for a featured panel.
- **Primary panel** (`.panel-primary`): the page's one framed object. In sheet it takes a 1.5px
  solid ink border instead of the hairline; in every other theme it is a plain panel. It marks
  the summary strip (dashboard), the "Still owed" strip (bills) and the members panel
  (Household), one per page; a second framed thing on a sheet page is a mistake.
- **Sheet panels** keep the 1px rule, at 20% ink (`sheet-rule`), on the near-white
  `sheet-highlight`.

### Inputs / Fields
- **Style:** full width, sheet background, 1px rule border (sheet: 1.5px solid ink, square),
  middle radius, 8px by 12px padding,
  16px text on a phone and 14px from `sm`, with placeholder at 70% muted ink.
- **Focus:** the border turns accent with a 2px ring of the accent at 25%.
- **Label:** a sans 600 label at 0.82rem, 6px above the field.
- **Hint** (`.field-hint`): muted 0.75rem under a field, capped at 60ch so it reads as a line,
  not a paragraph across the panel. Longer explanatory sentences in a form cap at 60ch too.
- **Computed figures are output, not fields** (`.field-output`): a ruled line under the inputs
  with `<output>` figures in the ledger face ("Total $87.70 (incl. $3.50 fee) · $29.23 each of
  3"). Nothing that can't be typed into is drawn as a box.
- **Selects are fields with a drawn chevron** (`select.field-input`, since 2026-10-13): the
  browser's menulist is turned off and a 12 by 6 stroked V in ink is drawn at the right edge
  (two diagonal gradient strokes meeting at the bottom, 14px from the edge), the same V the
  header menus carry as `ChevronIcon` and the public site's `select.s-input` draws. Every
  dropdown in the app and on the site wears this one chevron; a theme never gets its own.
- **File fields** (`input[type="file"].field-input`): the browser's button is restyled through
  `::file-selector-button` as the system's small default button (sheet: its 1.5px ink frame),
  so "Choose file" matches every other button on the page.

### Settings Save Bar
Settings is one long form with one Save. The form counts the fields that differ from what it
loaded; once there's at least one, the Save row sticks to the bottom of the screen at every
width (since 2026-10-12; it used to stick only on a phone) on the page color with a soft top
rule, reading "2 changes not saved yet" beside the button (after it from `sm`). Three things
on the page save differently, so the title's muted line says which ("Utilities and the look
save as you change them. Everything else saves together, with the button at the end."; a
member reads "Only a household admin can change these" there instead). The groups, in order
(since 2026-10-13, when Time zone joined Household and the lone Time group went): **Utilities**
first (the household's bill types: name, emoji, fee and owner, added from "+ Add utility" on
its rule and edited or removed in the Dialog; each saves on its own), then the form's groups,
**Household** (name with its address hint, tagline, time zone, how bills are split and the
payer), **Look** (saves itself the moment a theme is picked), **Features**, **Bills**,
**Reminders** (schedule, then the cron readout under a rule) and **Email**, then the Save row,
and last **Leave or delete**, which is everyone's: members can leave and download the CSV
there even though the rest of Settings is read-only for them. Every group is a panel at 20px
padding with 16px between its fields, titled by an eyebrow on a rule, and every hint sits
under the field it explains, never loose between fields.

### Navigation
- **Header:** a sheet-colored bar with a soft bottom rule. On the left is the household name as
  the wordmark, with its tagline beside it in the eyebrow voice from `md`; the wordmark is always
  a plain link home, never a dropdown. On the right are the household's text links (Overview,
  Bills, Trends, Docs, Members, Settings); a feature that's off loses its link. After a short
  vertical rule, the person's name with a drawn chevron (`ChevronIcon`, a 10px stroked V, the
  select's chevron; never a text glyph) opens the **one** header menu (`.nav-dropdown`): a
  panel with the dropdown shadow, 4px inset, right-aligned under the name, holding the email in
  small muted type, then (for people in more than one household) a "Switch to" eyebrow over
  their other households, then Account, Your households, Sign out, each a `.nav-dropdown-link`
  row that fills with the sheet tint on hover. Everything in it is the person's, not the
  household's, which is why switching lives there (decided 2026-10-12; until then the wordmark
  hid a second dropdown). On the demo the "Sign in" button appears only to someone signed out.
- **Phone menu:** below `sm` everything folds into one disclosure whose button names the page
  you're on ("Bills" with the chevron; "Menu" where no link matches), a default button. Its
  sheet drops under the header at full width with the dropdown shadow (it floats): the
  household's links, then "Switch to" and the other households, then the name as an eyebrow
  over Account, Your households and Sign out, stacked at a 44px height and divided by soft
  rules. The current link is ink with a 2px accent rule on its left edge.
- **Menus close** on every navigation, on Escape (focus back to the button) and on a click
  anywhere outside them, so two can never be open at once.
- **States:** links are muted sans at 0.875rem/500. Hover turns them ink, and the active link
  gets ink plus a 2px accent underline running the full bar height.
- **Peach:** the awning sits at the very top, the wordmark is Fraunces, and a soft rule sits
  under the bar.
- **Japandi:** the noren hangs at the very top, the wordmark is Zen Kaku 500 at 1.05rem in
  mixed case, the tagline beside it stays at the system's 0.7rem eyebrow size, and the active
  link's underline is aizome indigo.
- **Sheet:** the bar closes with a 1.5px ink rule (the site header's), the wordmark is Archivo
  800 at 1.15rem and 118% width, the tagline is Martian Mono at the sheet's 0.66rem eyebrow,
  and the active link is inked with the 2px underline in ink sitting on that rule. On the phone
  menu the sheet drops with no shadow inside a 1.5px ink frame, and the current link is inked at
  650 with a 2.5px underline offset 4px, no left stripe, the way the site marks its current page.
- **No logo, in any theme.** The household name is the identity. The peach app's PeachMark was
  that house's mark and doesn't come over. A product mark arrives later, with the final brand.
- **One bar, no sub-navigation.** Settings is a header link of its own (Overview, Bills,
  Trends, Docs, Members, Settings), and only the longest matching link is active, so
  Settings never lights Members too. There is no second row of tabs anywhere.

### Page Header and Actions
One pattern on every page (decided 2026-10-12, after a critique found the primary action in a
different place on every page):
- **The page header owns the action.** The household-name eyebrow and the title (with an
  optional muted line) on the left; on the right, **one slot** holding the page's single
  primary action, or nothing when no action earns it. The slot sits at the title's right at
  every width (it wraps under the title only when it must). Overview: "+ Add bill" for anyone
  who can post; Bills: "+ Add bill"; Docs: "+ Add document"; Members: "+ Invite". A page with
  nothing to add leaves the slot empty rather than filling it with a secondary: Trends, Email
  everyone (its form's Send is the page), and Settings, whose one form's Save follows you in the
  save bar instead.
- **Section actions sit on their section's rule**, after the hairline, as small default
  buttons: an action that belongs to one section ("+ Add" for a list inside a page, "Email
  everyone" on the members list, "Download CSV" on the totals). Never in the page slot.
- **Adding always opens the shared Dialog.** No inline disclosure that pushes a list down,
  no always-open form. The dialog's footer has Cancel and the primary.
- **Row actions are words, last on the row, in one order:** Remind, then Edit (small default
  buttons, the same at every width). Icons only for View and Download, which carry their
  aria-label and title. Destroying something lives in its Edit dialog's footer, on the left,
  and confirms inside that dialog (below).
- **Copy names the place the action lives**, so the cursor path is predictable: an owner who
  was just paid back ticks it on the Overview the email opened ("Owed to you"), and the full
  history with every row action is on Bills.

### Theme Switching
`<html data-theme data-color-scheme>` is set by the household's root layout from
`themeAttrs()` (`lib/theme.ts`: statement follows the household's colour scheme, the other
three are always light). A root layout is not re-rendered by a client navigation, so the
household `template.tsx` (re-rendered on every navigation) also renders `ThemeSync`
(`app/components/ThemeSync.tsx`), a client effect that writes the household's current theme
and scheme onto `<html>` when they differ. The Settings save action revalidates the household
subtree (`revalidatePath(householdPath(h), "layout")`), so saving a new theme repaints the
page in it on the redirect back, without a full load; the trends chart watches the attribute
and rebuilds. The theme is for everyone in the household, and household email follows it.

### Dialogs
There is one modal, `Dialog`: a native modal `<dialog>` (`.dialog`), a panel at the large
radius with the dialog shadow over a 35% black scrim (in sheet: square, no shadow, a 1.5px ink
frame). A display-voice title (Fraunces in peach, Zen Kaku in japandi, Archivo 800 in sheet)
names the action and its object, then the body, then a ruled footer with Cancel first and the
action as the primary button. Escape and the backdrop cancel, and focus returns to whatever
opened it.
- **Confirm** (`ConfirmButton`) asks before a destructive or consequential action: removing a
  member, a bill type or a document, deleting a bill, sending a reminder, or saving a change of
  mode or payer. One or two muted sentences on what happens and what doesn't; Cancel is focused
  first, so Enter never confirms by accident. Nothing uses the browser's `confirm()`. Routine
  saves never ask.
- **Form dialogs** hold a short form: adding a bill (from the page header's slot), adding or
  editing a bill type, and editing a bill (`.dialog-wide`, 36rem, for two fields side by
  side). The bill dialogs' description says what posting or saving does to the email. A save
  that goes through closes the dialog and the page's flash reports it; errors stay inside the
  dialog.
- **Sheets on a phone.** The longest form (adding a bill: type, dates, amount, PDF) opens as a
  full-screen sheet below `sm` (`Dialog sheet`): no frame, radius or shadow, the screen's edge
  is the frame. It fills the *visible* viewport, which shrinks when the keyboard opens, and
  scrolls inside itself; its footer becomes a sticky bar at the top with Cancel on the left and
  the primary on the right, so both stay above the keyboard while the focused field scrolls into
  view. From `sm` it is the ordinary centered dialog.
- **Destroying from a form dialog confirms in place.** The footer's left-hand "Delete bill"
  turns the footer into the question: a bold "Delete this bill?" with one or two sentences on
  what happens, then "Keep it" (focused) and the destructive primary. A dialog never opens on
  top of another.

### Choice Cards
Settings choices with consequences (the mode, the theme) are radio cards: a 1px rule panel at
the middle radius with a bold label and a muted line under it (`.choice-card`). The chosen
mode card (`.choice-card-checked`) takes the accent border and the accent wash; in sheet it
takes the site's chosen state instead, the panel ground with an ink border and a 3px ink rule
along the bottom (`box-shadow: inset 0 -3px 0` ink), never the highlighter. Theme cards also
carry a swatch of the theme drawn from its own tokens and faces (page, greeting in the display
face, a PAID tag and a ledger figure), so the choice reads before saving; the chosen theme card
takes the accent border with a 1px accent ring (ink, in sheet). There are four theme cards:
statement (grey page), peach (a 6px awning stripe over cream), japandi (a 4px oak band over
linen, "Hi, Robin" in Zen Kaku 500, the sealed PAID tag at 2px, and a 500-weight M PLUS 1 Code
figure) and sheet (the 24px grid drawn on the drafting-sheet page, "Hi, Robin" in Archivo 800
at 108%, a square PAID tag ringed at 35%, and a Martian Mono figure at 87.5%). Each card's note
says whether it follows dark mode, and the dark-mode radios appear only when statement is
chosen. Onboarding offers the same four choices as the site's square `.s-choice` cards, the
fourth titled "Drafting sheet".

### Trends Chart
A line per bill type on a panel, by statement month, at most 12 months ending this month: 2px
lines with gentle tension, 4px point shapes ringed in the panel color, horizontal soft-rule
grid lines only, and muted mono ticks. It draws in place with no entrance animation. Above it
sits a row of legend toggles (`.legend-toggle`, `aria-pressed`): small default buttons with the
series swatch, struck through and dimmed when off. The "compare with a year earlier" option
(`.legend-option`) adds dashed lines at 55% and reads as a wash when on (in sheet, the panel
ground with the 3px ink rule along its bottom, like a chosen card). The chart rebuilds when
the theme or the device scheme changes. Under it, a ledger table of totals per type is the
text equivalent: on a phone each figure takes its own line, label left, amount right.

### Calendar Links
Two small default buttons with a drawn calendar icon, "Apple Calendar" (`webcal://`) and
"Google Calendar". On the overview they sit at the foot of the page at every width ("Due dates
in your calendar:"), after the money and the working lists: a one-time setup never takes the
header's slot. On `/account`
they sit beside the copyable link and the reset.

### Ledger Table (signature)
The ruled table is the system's main element. It has mono uppercase eyebrow headers over a 16%
rule, 8% rules between rows, no zebra striping, right-aligned amounts, and the last row
unruled. On a phone it reflows into ledger cards (see Layout).

### Summary Strip (signature)
One panel split into three cells divided by soft rules. Each cell holds an eyebrow, a 1.7rem
mono figure, and a muted caption that says it in words ("across 2 unpaid bills", "all settled
up"). It is the first thing on the dashboard and the answer to "what do I owe". When the next
due date has passed, its caption says so in the unpaid color ("Water · 2 days late"). When
nothing is due from the viewer but they're owed on an open bill (the single payer, or any
owner), Next due is the soonest of those and who hasn't paid ("Electric · Sam hasn't paid
you"). An empty figure reads "None" in muted ink, never a dash.

### House Ledger
One row per direction, as recorded: "Alex owes you $30.00", "You owe Alex $12.00". The money
on every surface is gross and agrees with the strip, the bills page and the reminders. When two
people owe each other their rows sit together, followed by one muted 0.75rem line: "Settling
at once? Alex pays you $18.00 and you both check off each other's bills." The net never
appears as a primary figure. The viewer's own rows come first.

### Flash Messages
These are full-width bordered notes at the top of the content. Ok uses the paid wash with a 40%
paid border, and err uses the unpaid wash with a 40% unpaid border. Both keep their text in ink.

### Email Shell
Emails use the same four themes in inline styles only, light only, 560px wide. Statement has a
grey page, a white panel with a 10px radius, mono eyebrows and a blue button. Peach has cream
paper, an 8px awning stripe above the panel, Georgia body text and Courier eyebrows, because
email clients can't load Fraunces, Karla or Courier Prime. Japandi has linen paper, the noren
above the masthead (a 3px oak row, then the 20px seigaiha cloth, flat indigo where background
images are dropped; the first rows of the mail, as in the app; the panel keeps its full radius
and top rule), Helvetica body text and Menlo figures standing in for the two
Japanese faces, and a 22px heading at weight 500 (scale leads, not weight). Sheet has the
drafting-sheet page (no grid: email clients drop background images), a square panel with a
1.5px ink frame instead of the hairline, no band, a square ink button, Helvetica body text
and Menlo figures standing in for Archivo and Martian Mono, and a 21px heading at weight 800.
Colors aren't copied by hand: `emails/Shell.tsx` imports them from `lib/theme-tokens.ts`, and the band heights come
from `AWNING_STRIPE_PX`, `RAIL_PX` and `NOREN_PX`. Translucent rules are flattened onto the panel, and the
stripe uses the app's awning colors and 14px width.

### Motion
Motion is minimal and functional: 100ms color transitions and a pulsing skeleton while loading.
Peach's welcome tour (from the peach app, `feature_welcome_tour`) adds staggered entrances (`tour-pop`
0.4s and `tour-slide` 0.45s, both with a slight overshoot) and a PAID stamp that drops oversized
and settles at -3° (`tour-stamp`). A global `prefers-reduced-motion` rule at the end of
`app/globals.css` cuts every animation and transition to an instant, so new motion is covered
without opting in.

## Public Site: The Drafting Sheet

**Creative North Star: "The Floor Plan"**

The signed-out site (`/`, `/how-it-works`, `/about`, `/login`'s email and code steps, the
`app/(site)` route group) and the person's own pages outside any household (`/account`,
`/households` and the `/new` onboarding wizard, `app/(app)`, rendered by the same
`SiteShell`) are a visual world of their own, separate from the household themes, the way a
theme marketplace's own homepage is not one of its themes; since 2026-10-12 a household can
also wear it, as the `sheet` theme documented above. A page that belongs to no household has no
theme to wear, so it wears the site's. The household is drawn as an apartment floor plan on a cool white drafting
sheet: each bill is a utility line that runs from the meters along the hall and drops into every
room that splits it, and each share is written in the room like a dimension. Black ink and four
sidewalk-locate utility colors are the whole palette. Tone comes from hatching, never tints.

**Boundary.** The site itself reads every token below from `app/(site)/site.css`, scoped to
`html[data-site]` (set by the site's own root layout, `app/(site)/layout.tsx`, which never
renders household chrome); the site never reads `globals.css`'s theme blocks. The same
values now also live in `lib/theme-tokens.ts` as the `sheet` household theme (`THEME_COLORS.sheet`,
`SERIES.sheet`), in the frontmatter above as `sheet-*` and in `.impeccable/design.json`'s
`colorMeta`, and the `tokens` suite keeps those three in step with each other, not with
`site.css`; a change to the site's palette has to be made in both places. The sheet theme
reaches a household page only through `[data-theme="sheet"]` and reaches email only through
`emails/Shell.tsx`'s `sheet` palette. Statement, peach and japandi never reach the site, and
the site's own markup (`.s-*`) never appears on a household page.

**Key Characteristics:**
- One-bit palette: ink on sheet, with color reserved for the four utility lines.
- Every utility has a color, a dash pattern and a name, so color is never the only cue.
- Size is billing: share figures are the largest type on the page, all the same size.
- Square, inked, 1.5px-ruled everything. No radius, no shadow.
- Light only.

### Colors

- **Drafting Sheet** (#f3f5f4): the page and the sheet frame's ground, under a 24px grid of ink
  at 4.5% opacity. Also the browser `theme-color`.
- **Sheet Highlight** (#fbfcfb): rooms, share chips, fields, the inner pages' close panel, step
  asides, and the text on ink buttons.
- **Ink** (#111315): text, every rule and frame, the wall poché, the primary button fill. Hover
  on an ink button lightens to #2b3036.
- **Ink 2** (#4a5056): secondary text (ledes, prose, captions, drawing labels, inactive nav
  and footer links).
- **Rules**: ink at 20% for hairlines between list rows and around unselected bill tabs, ink at
  10% for hatching.
- **Utility locate colors**, line work only, never text or fills:
  - **Electric** (#d6231b), dash `13 3 3 3` (dash-dot).
  - **Gas** (#d29c00), dash `9 5` (even dashes).
  - **Water** (#1b5ecf), dash `1.5 4.5` (dotted). Water blue doubles as the focus ring (2px,
    2px offset; 0 offset on fields).
  - **Wifi** (#ec6612), dash `15 3 1.5 3 1.5 3` (dash-dot-dot).
- **Highlighter** (yellow `rgba(242, 196, 0, 0.42)`): text selection only, with ink text.

**The Locate Code Rule.** A utility color always travels with its dash pattern and its name (the
tab swatch, the trunk, the drop, the lane label). Color alone never carries meaning, and the
four colors never color text, fills or backgrounds. Two rules may be drawn in it: the selected
tab's 3px bottom rule, and the 3px border of the chip belonging to whoever fronted the bill,
which is how the owner's room reads at a glance.

**The Hatching Rule.** When a surface needs tone it comes from 45° hatching (1px ink at 10%
every 8 to 9px). Never a tinted fill. The home page currently needs none: it is ink on sheet.

### Typography

**Display and body:** Archivo, loaded with its width axis (`--nf-archivo`, declared once in
`app/site-fonts.ts` and shared with the sheet theme, not preloaded; Martian Mono is). Headings run
expanded and heavy: the home H1 800 at 112% width, clamp(2.2rem to 3.6rem), line-height 1.02,
-0.028em, max 18ch; inner-sheet H1s clamp(2.4rem to 4.2rem); H2 800 at 108%, clamp(1.7rem to
2.4rem), max 22ch; H3 700 at 1.08rem. The wordmark is 800 at 118% (1.1rem in the footer). Body
prose 1.04rem / 1.6 in ink 2, max 62ch; the home lede up to 1.15rem, max 56ch; buttons and
bill tabs 650.

**Figures and labels:** Martian Mono with its width axis (`--nf-martian`), tabular figures,
condensed: 87.5% for amounts, room numbers and the sample note, 75% for the share figures, 85%
for step numbers. Labels (room numbers, the meter tag, the sample note, the 404's number) are
uppercase at 0.58 to 0.66rem with 0.06 to 0.1em tracking. These are drawing annotations that
name the thing beside them, not section kickers; nothing else on the site is set in mono.

**The Size Is Billing Rule.** On the plan, the share figures (mono 600 at 75% width,
clamp(2.1rem, 0.9rem + 5.2cqi, 3.5rem)) outweigh the H1. Every figure is the same size and
every chip the same width (16rem, or the room's width), so selecting a bill never reflows the
sheet; the owner is told by color, not size. The currency sign sits at 0.6em, raised. A
checked-off share keeps its size, drops to ink 2 and takes a 2px strike.

### Layout

**Pitch first, then the one drawing.** The home page reads top to bottom inside a 1360px wrap
(16px gutters, 28px from 640px): a plain hero (H1, lede ending in the facts, the signup as one
row with its small print on one line) with no frame around it, then the sheet, the page's only
frame: 1.5px ink on the 24px grid, up to 1100px wide and left-aligned with the hero, holding
the plan and nothing else. Price and
"never moves money" live in the lede, not in a table. There is no sidebar at any width.

**Poché walls.** The plan is a CSS grid whose background is ink; the grid gap is the wall
(7px, 8px from a 720px container) and each room is a sheet-highlight cell. Four bedrooms sit
two above and two below a hall (104px, 116px tall) where the trunks run in lanes and the
meters stand at the hall's end, the same four rooms at every width: no decorative rooms.
Bottom-row rooms reverse their stack so the share sits by the hall wall. Above the rooms one
bar: a tab per bill on the left, the mode toggle on the right; below them one line, the split
in words with the sample note at its end.

**The Lane Label Rule.** Only the selected bill's lane is labeled (name and total); the others
are named by their tabs. The label is set in the rightmost gap along the hall that is clear of
every drop, measured from its rendered width, and haloed in sheet highlight (4px paint-order
stroke) so a drop passes under it, never through it. Fall back to beside the meters.

**Below the sheet** the home page says three things and stops: three facts in one row from
760px under a single 1.5px rule, one line on reminders handing off to How it works, then the
close (a rule, the heading and the signup side by side from 900px). What How it works already
covers is not repeated here. The inner pages keep their calmer rhythm: sections of 64px (96px
from 640px) divided by 20% rules, a 5:7 split from 900px with a sticky heading, numbered notes
and steps with mono counters, and a framed close panel.

**Phone reflow.** The order is the same, the pieces stack: H1, lede, the signup as a column,
then the sheet with the bill tabs 2 by 2 and the mode toggle full width above the 2 by 2 rooms,
the facts one under another, the close, and the footer as a column. The header stays one row
at every width: wordmark, two page links, Sign in; the demo button appears from 640px because
the hero's demo link is a thumb away on a phone, and the signed-in button says "Open" (or
"Set up") below 640px and "Open your household" from there, the long label kept as its
accessible name.

### Elevation & Depth

Flat and light only (`color-scheme: light`; there is no dark sheet: it is a sheet of paper and
the figures must read on it at a glance). Depth is line weight: 1.5px ink for frames, fields,
buttons and section tops, 1px for internal divisions, 20% ink for hairlines. The owner's share
chip uses a 3px border in the bill's color instead of any lift. No shadows anywhere.

### Shapes

Square. No radius on buttons, fields, chips, frames or panels (`border-radius: 0` is explicit
on inputs). Terminals at the end of a drop are 9px squares for the owner (filled ink) and 3.5px
radius circles for splitters (filled in the utility color), both outlined in ink.

### Components

- **Buttons:** square, 48px tall (38px small), 20px side padding, 1.5px ink border, Archivo 650
  at 106% width. Primary is an ink fill with sheet-highlight text, hovering to #2b3036. Line is
  transparent with ink text, hovering to sheet highlight. Arrows are an inline 18 by 10 stroked
  SVG. Color transitions 120ms ease-out.
- **Fields:** square, 48px tall, 1.5px ink border, sheet-highlight fill, 16px text, ink caret;
  focus is the 2px water-blue outline. A select draws the app's stroked V in ink at its right
  edge (see Inputs / Fields above), never the browser's menulist. The signup pairs field and button in one row from
  640px (max 560px), with one line of small print below in ink 2 that also carries the demo
  link; the field's label is for assistive tech, the heading above is its visible label.
- **Text links:** 600 weight, underline 1.5px at 4px offset in rule color, inking on hover.
- **Segmented toggle:** two equal ink-bordered cells; the pressed one fills ink.
- **Bill tabs:** a toggle per utility with its dashed swatch and name only (its total and who
  fronts it appear on the plan once selected, and in the tab's accessible name); 42px tall,
  bordered in 20% ink; the selected one takes an ink border, sheet-highlight ground and a 3px
  bottom rule in its color. Two by two under a 560px container, one row above.
- **Share chip:** a button in the room with the figure, a drawn checkbox and a caption ("owes
  Jordan · due Oct 13"), 16rem wide; the owner's chip is ruled 3px in the bill's color, its
  caption in ink ("fronted $104.12 · owed back"), and is not a toggle.
- **Site nav:** the wordmark (the way home) and two plain Archivo links, How it works and
  About, in ink 2; the current page inks its label and takes a 2.5px ink underline that sits
  on the header's rule. No sheet numbers. `lib/site.ts` holds the links.
- **Your pages** (`.s-account`): the sign-in column, 640px wide, for account, your households
  and onboarding: a mono key line (the email, or "Welcome to Lejer"), the H1, then forms in
  `.s-form` / `.s-field` (label, 48px field, one line of small print). **Choice cards**
  (`.s-choice`, mode and theme): the bill tabs' language, a 20% rule at rest and, when chosen,
  the ink border with a 3px ink rule along the bottom; the native radio stays, inked. **Cards**
  (`.s-card`, one per calendar): the title block's frame on sheet highlight, a hairline before
  the reset. **Ruled list** (`.s-list`, your households): a 1.5px rule on top, hairlines between
  rows, the name in Archivo 650 and the path in mono, a line "Open" button at the right.
  **Notes** (`.s-notice`): the alert's frame without the electric edge, for "Name updated".
  Sign out is a line button at the end of the account page and a footer link.
- **Footer strip:** one row under a 1.5px rule: the wordmark, the page links plus Sign in (or
  Your households) and Try the demo, and "© year Built by" with `BRAND.legalName` linked to
  `BRAND.legalUrl` at the far end; a column under 640px.
- **Close:** on the home page a 1.5px rule, the heading and prose beside the signup from
  900px; on the inner pages a framed panel on sheet highlight, heading and prose beside the
  signup from 900px, divided by a 1px ink rule.

- **Operator admin** (`/admin`, `.s-admin`, 2026-10-18): the sheet's full width, in five
  sections (Overview, Households, People, Email, Waitlist). From 900px a sticky list of the
  sections stands at the left on a 1.5px rule with hairlines between, each with its count in
  mono; the open one takes the 3px ink edge and the sheet-highlight ground, the way a chosen
  choice card does. On a phone the list is one select. The H1 is "Admin" with the totals as its
  lede, no key line over it. **Tables** (`.s-table`) are the ruled list drawn as a table: a
  1.5px rule on top, hairlines between rows, small uppercase labels in ink 2 that sort on click
  (the whole label is the button; a drawn two-way or one-way arrow says the state, in a 1.4px
  stroke), figures right-aligned in condensed Martian Mono, names in Archivo 650 with ringed
  mono tags beside them and a mono sub-line (the slug, the address) under. Below 720px the
  date columns fold under the name as one line, a "Sort by" select appears above, and the two
  row actions (Details, Email: underlined words at the row's right) stack. A row opens in
  place (`.s-expand`): sheet highlight under an inked rule, members or facts in two columns
  from 720px, a key/value list (`.s-kv`: label in ink 2, hairlines between), and the delete
  folded under one underlined word, which opens a framed panel (ink frame, no colored edge)
  with the warning, the key to type and the red line button. A row a link pointed at flashes
  the highlighter and fades. **Needs attention** lines are underlined links, each marked with
  an 8px square ruled 1.5px in electric (line work, never a fill). The four figures use the
  summary strip (`.s-stats`) in condensed mono. The **compose form** is the site's form with
  the audience first: four radios, and under "Some households" / "Some people" a framed pick
  list (1.5px ink, sheet highlight, two columns from 640px, 260px tall and scrolling) whose
  disabled rows name the reason; the one `<dialog>` confirms a send. Under it, the day's
  sends by kind and the week's failures as tight ruled tables. No cards, no second frame: the
  page is type, rules and two kinds of field.

### Motion

**Pencil, then ink.** Selecting a bill, or switching modes, redraws every drop: a 1px ink pencil
line draws along the path (520ms, cubic-bezier(0.16, 1, 0.3, 1)) and fades, then the colored
ink line appears (260ms ease-out) 300ms later, staggered 110ms per room. Trunks brighten from
40% to full opacity on selection (200ms). A checked-off or owner drop turns solid and heavier
(3.5px). The global reduced-motion rule in `app/globals.css`, which the site also loads, cuts
all of it to an instant.

### Do's and Don'ts (site only)

- **Do** keep the site's own tokens in `app/(site)/site.css` under `html[data-site]`. Their
  household copy is the `sheet` theme in `lib/theme-tokens.ts`; change both when the palette
  moves, and never make the site read the household stylesheet.
- **Do** give any new utility or line all three cues: a locate color, a distinct dash pattern
  and a name.
- **Do** set every amount, sheet number and drawing label in Martian Mono with tabular figures
  at a condensed width.
- **Do** keep share figures bigger than the H1, all one size, and mark the owner by color.
- **Do** add a new public page to `SITE_LINKS` in `lib/site.ts` (the header and footer map
  over it) and to `SITE_PAGES` so the proxy lets it through.
- **Don't** put statement, peach or japandi on a site page, or the site's `.s-*` markup on a
  household page. A household wears the drafting sheet only as the `sheet` theme.
- **Don't** tint a surface for tone. Hatch it.
- **Don't** round a corner or add a shadow.
- **Don't** add a dark scheme to the site.
- **Don't** use a utility color for text or a fill.
- **Don't** add a second frame, a sidebar or a key/value table to the home page. The sheet is
  the only framed thing; everything else is plain type on the page.

## Do's and Don'ts

### Do:
- **Do** set every amount, date, count and eyebrow in the theme's ledger mono with tabular
  figures, and right-align amount columns.
- **Do** build every new surface from the shared component classes (`.panel`, `.btn*`, `.tag*`,
  `.due-*`, `.field-*`, `.data-table`, `.eyebrow`, `.figure`, `.panel-primary`, `.choice-card`)
  so all four themes come for free.
  A theme varies tokens and a few signature rules, not markup.
- **Do** add theme differences as token overrides under `[data-theme="peach"]`,
  `[data-theme="japandi"]` or `[data-theme="sheet"]`, keeping peach's rounder radii, pill tags,
  bolder eyebrows, Fraunces titles and awning, japandi's crisper radii, square tags, the PAID
  seal, 500-weight titles and figures, and the noren, and the sheet's zero radii, 24px grid,
  1.5px ink frames, ringed tags, wide Archivo titles and condensed Martian figures.
- **Do** give each screen exactly one primary button, and keep its tap target at 36px or more.
  The small button is for inline row actions.
- **Do** make every new table a `.table-stack` with named grid areas for its phone layout.
- **Do** pair every figure with a plain-words caption in muted ink ("from 2 roommates",
  "nothing due from you").
- **Do** check new color pairs in all four themes and in statement dark, and keep text at 4.5:1
  or better. Record peach's, japandi's and sheet's measured ratios in Colors > Contrast.
- **Do** change a theme color in `lib/theme-tokens.ts` first, then mirror it in
  `app/globals.css`, this file and `.impeccable/design.json` until `npm run verify -- tokens`
  passes.
- **Do** give a chart a legend of real buttons, a point shape per series, and a table that
  says the same thing in figures. Take series colors from `--series-N` in slot order.
- **Do** ask with `ConfirmButton` before anything that removes, sends or reassigns, and never
  with the browser's `confirm()`. Put any other modal content in `Dialog`; never hand-roll an
  overlay.
- **Do** leave an empty cell empty. No "—" placeholders in tables or figures.
- **Do** keep japandi's one accent interactive-only: aizome indigo for links, focus, selection,
  checked controls and the primary button, and nothing else (the noren is the one place the
  indigo is decorative). Mount any new japandi flourish on the noren or not at all.
- **Do** let the global reduced-motion rule handle motion. Never re-enable animation with
  `!important` under `prefers-reduced-motion`.
- **Do** keep the sheet's highlighter for text selection only. A chosen or pressed thing in
  sheet takes the ink border and the 3px ink rule along its bottom.
- **Do** frame exactly one panel per sheet page with `.panel-primary`, and draw a neutral chip
  in sheet as a ringed box, never a tinted one.

### Don't:
- **Don't** "fix" one theme toward another. Fraunces, the awning, the pills and the warm
  palette are intentional; so are japandi's lighter weights, square tags, sealed PAID and wave
  noren, and the sheet's hard corners, heavy frames, grid and black-ink accent. None of it
  is slop.
- **Don't** give peach, japandi or sheet a dark mode. All three are light-only on purpose; a
  sumi-ink dark variant for japandi is deferred, not planned, and a sheet of paper has no dark
  side.
- **Don't** use green, red or amber (sage, rose or butter; moss, persimmon or ochre) for anything
  but paid, unpaid and due soon, and don't add a second accent to statement or japandi. Series
  colors stay inside charts.
- **Don't** fill a block with solid red for an unpaid or overdue state. Use the wash and colored
  text.
- **Don't** add shadows, gradients or glows to panels, cards or buttons at rest. The awning
  stripes, the noren's waves and the sheet's grid lines are the only gradients in the system;
  the PAID seal is the only ringed tag outside sheet, where every tag is ringed.
- **Don't** give the sheet a shadow anywhere, a radius anywhere, or a second accent. Its
  dialog and phone menu are framed, not lifted.
- **Don't** let a phone layout scroll sideways, or set an input below 16px on a phone.
- **Don't** spell the product name or domain in UI or email. Read them from `BRAND`.
- **Don't** put a logo in the nav. The household name is the wordmark.
- **Don't** hard-code a color in an email template. Take it from `lib/theme-tokens.ts`.
