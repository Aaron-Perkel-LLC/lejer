import { BRAND } from "@/lib/brand";
import { NOREN_PX, RAIL_PX, SEIGAIHA_TILE, THEME_COLORS, seigaiha } from "@/lib/theme-tokens";
import type { Theme } from "@/lib/types";

/** The theme choice cards' words, in THEMES order (sheet first: the default). Settings and onboarding share them. */
export const THEME_CARDS: Record<Theme, { title: string; note: string }> = {
  sheet: { title: "Drafting sheet", note: `${BRAND.name}'s own look: ink on a gridded sheet, square and ruled. Always light.` },
  statement: { title: "Statement", note: "Grey paper, one blue, and a monospace ledger. Follows dark mode if you like." },
  peach: { title: "Peach", note: "Cream paper under a striped awning, with a typewriter ledger. Always light." },
  japandi: { title: "Japandi", note: "Linen paper, sumi ink and an indigo wave noren, with indigo for links. Always light." },
};

/**
 * Each theme's faces for the swatch, as --nf-* variables. The element that wears them is
 * whatever sets app/theme-fonts.ts's `themeFaces` above the swatch: <html> in the household app,
 * the fieldset on onboarding.
 */
const SWATCH_FACES: Record<Theme, { display: string; body: string; ledger: string }> = {
  statement: { display: "system-ui, sans-serif", body: "system-ui, sans-serif", ledger: "var(--nf-plex), monospace" },
  peach: { display: "var(--nf-fraunces), Georgia, serif", body: "var(--nf-karla), system-ui, sans-serif", ledger: "var(--nf-courier), monospace" },
  japandi: { display: "var(--nf-zen), system-ui, sans-serif", body: "var(--nf-zen), system-ui, sans-serif", ledger: "var(--nf-mplus), monospace" },
  sheet: { display: "var(--nf-archivo), system-ui, sans-serif", body: "var(--nf-archivo), system-ui, sans-serif", ledger: "var(--nf-martian), monospace" },
};

/**
 * A small piece of a theme drawn from its own tokens and faces (its page, its awning or noren,
 * a greeting in its display face and a paid bill in its ledger face), so a choice card reads as
 * its theme whatever the page around it wears. Inline styles only: it sits on the site's root
 * (onboarding) as well as on any household theme (Settings).
 */
export default function ThemeSwatch({ value }: { value: Theme }) {
  const t = THEME_COLORS[value];
  const faces = SWATCH_FACES[value];
  const sheet = value === "sheet";
  const tagRadius = value === "peach" ? 9999 : value === "japandi" ? 2 : sheet ? 0 : 4;
  const ledgerWeight = value === "japandi" ? 500 : 600;
  const narrow = sheet ? "87.5%" : undefined;
  return (
    <span
      aria-hidden="true"
      className="block"
      style={{
        background: t.page,
        backgroundImage: sheet ? `linear-gradient(${THEME_COLORS.sheet.grid} 1px, transparent 1px), linear-gradient(90deg, ${THEME_COLORS.sheet.grid} 1px, transparent 1px)` : undefined,
        backgroundSize: sheet ? "24px 24px" : undefined,
      }}
    >
      {value === "peach" && <span className="block h-1.5" style={{ background: `repeating-linear-gradient(90deg, ${THEME_COLORS.peach.stripeA} 0 14px, ${THEME_COLORS.peach.stripeB} 14px 28px)` }} />}
      {value === "japandi" && (
        <span
          className="block"
          style={{
            height: RAIL_PX + NOREN_PX / 2,
            borderTop: `${RAIL_PX}px solid ${THEME_COLORS.japandi.rail}`,
            backgroundColor: THEME_COLORS.japandi.accent,
            backgroundImage: seigaiha(THEME_COLORS.japandi.accent, THEME_COLORS.japandi.onPrimary),
            backgroundSize: `${SEIGAIHA_TILE.width / 2}px ${SEIGAIHA_TILE.height / 2}px`,
          }}
        />
      )}
      <span className="block px-4 pt-3 pb-3.5">
        <span className="block text-base leading-tight" style={{ color: t.ink, fontFamily: faces.display, fontWeight: value === "japandi" ? 500 : sheet ? 800 : 600, fontStretch: sheet ? "108%" : undefined }}>
          Hi, Robin
        </span>
        <span
          className="mt-2.5 flex items-center justify-between gap-3 px-2.5 py-1.5"
          style={{
            background: t.panel,
            border: sheet ? `1.5px solid ${t.ink}` : `1px solid ${t.line}`,
            borderRadius: sheet ? 0 : value === "peach" ? 8 : value === "japandi" ? 3 : 5,
          }}
        >
          <span className="text-sm" style={{ color: t.ink, fontFamily: faces.body }}>
            Electric
          </span>
          <span className="flex items-center gap-2">
            <span
              className="text-[0.7rem] font-bold uppercase tracking-[0.08em]"
              style={{
                color: t.paid, background: t.paidSoft, borderRadius: tagRadius, padding: "1px 6px", fontFamily: faces.ledger,
                boxShadow: value === "japandi" ? `inset 0 0 0 1px ${t.paid}` : sheet ? `inset 0 0 0 1px color-mix(in srgb, ${t.paid} 35%, transparent)` : undefined,
                fontStretch: narrow,
              }}
            >
              Paid
            </span>
            <span className="text-sm tabular-nums" style={{ color: t.ink, fontFamily: faces.ledger, fontWeight: ledgerWeight, fontStretch: narrow }}>
              $26.03
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
