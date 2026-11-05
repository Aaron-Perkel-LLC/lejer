import type { ReactNode } from "react";
import { Body, Column, Container, Head, Html, Link, Preview, Row, Section, Text } from "@react-email/components";
import { AWNING_STRIPE_PX, NOREN_PX, RAIL_PX, SEIGAIHA_TILE, THEME_COLORS, flatten, seigaiha } from "../lib/theme-tokens";
import { BRAND } from "../lib/brand";
import type { Theme } from "../lib/types";

// The wrapper every email renders in, in the household's theme. Inline styles only
// (clients ignore stylesheets), light only (client dark modes are unreliable), 560 px.
// statement: grey page, white panel, mono eyebrows (utilities). peach: cream paper, the
// awning stripe, Georgia + Courier (peach-cob). japandi: linen paper, the indigo noren, Helvetica +
// Menlo. sheet: the site's drafting sheet, square with a 1.5px ink frame, Helvetica + Menlo. Colors come from lib/theme-tokens.ts, the same values as the light tokens in
// globals.css; only the fonts are email-safe stand-ins.

function colors(t: (typeof THEME_COLORS)[Theme]) {
  return {
    page: t.page, panel: t.panel, ink: t.ink, muted: t.inkMuted,
    line: flatten(t.line, t.panel), accent: t.accent, onAccent: t.onPrimary, unpaid: t.unpaid, paid: t.paid,
  };
}

/** The panel's frame: a hairline in the rule color, or (sheet) 1.5px of ink. */
const frame = (p: { frame: number; line: string; ink: string }) => `${p.frame}px solid ${p.frame > 1 ? p.ink : p.line}`;

const { stripeA, stripeB } = THEME_COLORS.peach;
const { rail, accent: indigo, onPrimary: linen } = THEME_COLORS.japandi;

// `stripe` is the band (peach's awning, japandi's noren) and `stripeHeight` its height; statement
// has none. Peach's sits on the panel's top edge; japandi's (`rail: true`) hangs above the
// masthead, the first thing in the mail, like the app's: a `rod` of oak, then the cloth. A
// client that drops background images shows the cloth as flat indigo (`stripeBase`).
const PALETTES = {
  statement: {
    ...colors(THEME_COLORS.statement),
    body: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
    mono: "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace",
    headingSize: 19, headingWeight: 700, bodySize: 14,
    stripe: null as string | null, stripeBase: null as string | null, stripeSize: null as string | null, stripeHeight: 0,
    rod: null as string | null, rail: false, radius: 10, frame: 1,
  },
  peach: {
    ...colors(THEME_COLORS.peach),
    body: "Georgia,'Times New Roman',serif",
    mono: "'Courier New',Courier,monospace",
    headingSize: 22, headingWeight: 700, bodySize: 15,
    stripe: `repeating-linear-gradient(90deg,${stripeA} 0,${stripeA} ${AWNING_STRIPE_PX}px,${stripeB} ${AWNING_STRIPE_PX}px,${stripeB} ${AWNING_STRIPE_PX * 2}px)`,
    stripeBase: stripeA as string | null,
    stripeSize: null as string | null,
    stripeHeight: 8,
    rod: null as string | null,
    rail: false, radius: 10, frame: 1,
  },
  japandi: {
    ...colors(THEME_COLORS.japandi),
    body: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    mono: "Menlo,Consolas,'Courier New',monospace",
    headingSize: 22, headingWeight: 500, bodySize: 14, // scale leads, not weight
    stripe: seigaiha(indigo, linen),
    stripeBase: indigo as string | null,
    stripeSize: `${SEIGAIHA_TILE.width}px ${SEIGAIHA_TILE.height}px` as string | null,
    stripeHeight: NOREN_PX,
    rod: rail as string | null,
    rail: true, radius: 10, frame: 1, // the noren above the masthead, like the app's first rows
  },
  sheet: {
    ...colors(THEME_COLORS.sheet),
    body: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    mono: "Menlo,Consolas,'Courier New',monospace",
    headingSize: 21, headingWeight: 800, bodySize: 14,
    stripe: null as string | null, stripeBase: null as string | null, stripeSize: null as string | null, stripeHeight: 0,
    rod: null as string | null, rail: false, radius: 0, frame: 1.5, // square, a 1.5px ink frame like the site's sheet
  },
} as const;

export type Palette = (typeof PALETTES)[Theme];
export const palette = (theme: Theme): Palette => PALETTES[theme] ?? PALETTES.statement;

/**
 * The footer's unsubscribe link, set by sendMail (lib/mail.ts) on the template's root element
 * for every kind that has one; templates pass it through to the Shell. Never set on
 * transactional mail (codes, invites, deletion).
 */
export interface UnsubscribeLink {
  url: string;
  label: string;
}

export function Shell({
  theme,
  masthead,
  footer,
  contact,
  unsubscribe,
  preview,
  children,
}: {
  theme: Theme;
  masthead: string; // BRAND.name, or "{name} · {household}"
  footer?: string; // the domain, under household and account mail; site mail (the operator's note) shows only the reply address
  contact?: string | null; // reply address shown in the footer
  unsubscribe?: UnsubscribeLink;
  preview: string;
  children: ReactNode;
}) {
  const p = palette(theme);
  const small = { fontFamily: p.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: p.muted, margin: 0 };
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: "28px 16px", background: p.page }}>
        <Container style={{ width: "100%", maxWidth: 560 }}>
          {p.stripe && p.rail && (
            <>
              {p.rod && <Section style={{ height: RAIL_PX, backgroundColor: p.rod }} />}
              <Section style={{ height: p.stripeHeight, marginBottom: 14, backgroundColor: p.stripeBase ?? undefined, backgroundImage: p.stripe, backgroundSize: p.stripeSize ?? undefined }} />
            </>
          )}
          <Text style={{ ...small, fontWeight: 600, padding: "0 6px 10px" }}>{masthead}</Text>
          {p.stripe && !p.rail && (
            <Section style={{ height: p.stripeHeight, borderRadius: "10px 10px 0 0", backgroundColor: p.stripeBase ?? undefined, backgroundImage: p.stripe }} />
          )}
          <Section
            style={{
              background: p.panel,
              border: frame(p),
              borderTop: p.stripe && !p.rail ? 0 : frame(p),
              borderRadius: p.stripe && !p.rail ? `0 0 ${p.radius}px ${p.radius}px` : p.radius,
              padding: "26px 28px",
            }}
          >
            {children}
          </Section>
          {/* The footer: the domain and/or the reply address, then who sends it, then the way out. */}
          <Section style={{ padding: "14px 6px 0" }}>
            {(footer || contact) && (
              <Text style={{ ...small, letterSpacing: "0.1em" }}>
                {footer}
                {contact && (
                  <>
                    {footer && " · "}
                    <Link href={`mailto:${contact}`} style={{ color: p.accent, textDecoration: "none", textTransform: "none" }}>
                      {contact}
                    </Link>
                  </>
                )}
              </Text>
            )}
            <Text style={{ ...small, letterSpacing: "0.1em", margin: "6px 0 0" }}>
              {BRAND.name} · {BRAND.legalName}
            </Text>
            {unsubscribe && (
              <Text style={{ fontFamily: p.body, fontSize: 12, color: p.muted, margin: "10px 0 0" }}>
                <Link href={unsubscribe.url} style={{ color: p.muted, textDecoration: "underline" }}>
                  {unsubscribe.label}
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function Eyebrow({ theme, urgent, paid, children }: { theme: Theme; urgent?: boolean; paid?: boolean; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: urgent ? p.unpaid : paid ? p.paid : p.muted, margin: "0 0 10px" }}>
      {children}
    </Text>
  );
}

export function Heading({ theme, children }: { theme: Theme; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.body, fontSize: p.headingSize, fontWeight: p.headingWeight, color: p.ink, margin: "0 0 14px", lineHeight: 1.3 }}>
      {children}
    </Text>
  );
}

/** `top` opens a gap above (a closing line after a button), instead of an empty line in the text. */
export function Paragraph({ theme, muted, top, children }: { theme: Theme; muted?: boolean; top?: boolean; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Text style={{ fontFamily: p.body, fontSize: muted ? 13 : p.bodySize, lineHeight: 1.55, color: muted ? p.muted : p.ink, margin: top ? "22px 0 0" : "0 0 14px" }}>
      {children}
    </Text>
  );
}

export function ButtonLink({ theme, href, children }: { theme: Theme; href: string; children: ReactNode }) {
  const p = palette(theme);
  return (
    <Link
      href={href}
      style={{ display: "inline-block", padding: "9px 16px", background: p.accent, color: p.onAccent, border: `1px solid ${p.accent}`, borderRadius: p.radius ? 7 : 0, fontFamily: p.body, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}


/** Ruled label/value rows, the email cousin of the site's .data-table. */
export function Rows({ theme, rows }: { theme: Theme; rows: { label: string; value: string; strong?: boolean; urgent?: boolean; paid?: boolean }[] }) {
  const p = palette(theme);
  return (
    <Section style={{ margin: "4px 0 18px", borderTop: `1px solid ${p.line}`, borderBottom: `1px solid ${p.line}` }}>
      {rows.map((r, i) => (
        <Row key={r.label} style={{ borderTop: i === 0 ? undefined : `1px solid ${p.line}` }}>
          <Column style={{ padding: "9px 2px", fontFamily: p.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: p.muted }}>
            {r.label}
          </Column>
          <Column align="right" style={{ padding: "9px 2px", fontFamily: p.mono, fontSize: r.strong ? 15 : 13, fontWeight: r.strong ? 700 : 400, color: r.urgent ? p.unpaid : r.paid ? p.paid : p.ink }}>
            {r.value}
          </Column>
        </Row>
      ))}
    </Section>
  );
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "2026-10-14" → "October 14, 2026" (no timezone shift: it's a calendar date). */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Robin, Jordan & Casey". */
export function nameList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** Freeform text as paragraphs: blank lines split paragraphs, single newlines become breaks. */
export function Prose({ theme, text }: { theme: Theme; text: string }) {
  return (
    <>
      {text
        .trim()
        .split(/\n\s*\n/)
        .map((para, i) => (
          <Paragraph key={i} theme={theme}>
            {para.split("\n").map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </Paragraph>
        ))}
    </>
  );
}
