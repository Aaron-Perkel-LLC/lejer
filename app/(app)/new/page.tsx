import type { Metadata } from "next";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { requireMemberUser } from "@/lib/context";
import { createHouseholdAction } from "./actions";
import TimezoneSelect from "@/app/components/TimezoneSelect";
import { BRAND } from "@/lib/brand";
import { DEFAULT_THEME, THEMES } from "@/lib/theme";
import ThemeSwatch, { THEME_CARDS } from "@/app/components/ThemeSwatch";
import { themeFaces } from "@/app/theme-fonts";
import { STARTER_UTILITIES } from "@/lib/households";

export const metadata: Metadata = { title: "Set up your household" };

const MODES = [
  {
    value: "single_payer",
    title: "One person pays",
    blurb: "One roommate pays every bill and everyone else pays them back.",
  },
  {
    value: "ledger",
    title: "Each bill has an owner",
    blurb: `Different people front different bills; ${BRAND.name} tracks who owes whom.`,
  },
] as const;

// The onboarding wizard, in the public site's look (SiteShell): a new account has no
// household yet, so there is no theme to wear. Mode and theme are square choice cards; each
// theme card opens with that theme's own swatch (app/components/ThemeSwatch.tsx), drawn in its
// faces, which the fieldset carries (app/theme-fonts.ts; none preloads, so only the four
// swatches' faces load).
export default async function NewHouseholdPage({ searchParams }: PageProps<"/new">) {
  const user = await requireMemberUser();
  const { ok, err } = await searchParams;

  return (
    <main className="s-wrap s-account">
      <span className="s-key">Welcome to {BRAND.name}</span>
      <h1 className="s-h1">Set up your household.</h1>
      <Flash ok={ok} err={err} site />
      <form action={createHouseholdAction} className="s-form">
        <div className="s-field">
          <label className="s-label" htmlFor="name">Your name</label>
          <input className="s-input" id="name" name="name" defaultValue={user.name} maxLength={80} required autoFocus />
          <p className="s-hint">Your roommates see this. Signed in as {user.email}.</p>
        </div>

        <div className="s-field">
          <label className="s-label" htmlFor="householdName">Household name</label>
          <input className="s-input" id="householdName" name="householdName" placeholder="12 Elm Street" maxLength={80} required />
        </div>

        <fieldset className="s-field">
          <legend className="s-label">How are bills paid?</legend>
          <div className="s-choices">
            {MODES.map((m, i) => (
              <label key={m.value} className="s-choice">
                <input type="radio" name="mode" value={m.value} defaultChecked={i === 0} required />
                <span>
                  <span className="s-choice-title">{m.title}</span>
                  <span className="s-choice-blurb">{m.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="s-hint">You can switch later in settings; nothing is lost either way.</p>
        </fieldset>

        {/* Each checked utility opens its emoji and fee fields (CSS :has, no script); an unchecked
            one's fields still post, and the action ignores them. */}
        <fieldset className="s-field">
          <legend className="s-label">Which bills does your house split?</legend>
          <div className="s-choices">
            {STARTER_UTILITIES.map((u) => (
              <div key={u.key} className="s-choice s-utility">
                <input type="checkbox" id={`u-${u.key}`} name="utilities" value={u.key} defaultChecked />
                <label htmlFor={`u-${u.key}`} className="s-choice-title">
                  {u.name}
                </label>
                <div className="s-utility-fields">
                  <div>
                    <label className="s-utility-label" htmlFor={`emoji-${u.key}`}>Emoji</label>
                    <input className="s-input s-input-sm" id={`emoji-${u.key}`} name={`emoji_${u.key}`} defaultValue={u.emoji} aria-describedby="utilities-emoji-hint" />
                  </div>
                  <div>
                    <label className="s-utility-label" htmlFor={`fee-${u.key}`}>Processing fee</label>
                    <input className="s-input s-input-sm" id={`fee-${u.key}`} name={`fee_${u.key}`} defaultValue="0.00" inputMode="decimal" aria-describedby="utilities-fee-hint" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="s-hint" id="utilities-fee-hint">
            If your provider charges a fee to pay online, add it now. You can always change it later.
          </p>
          <p className="s-hint" id="utilities-emoji-hint">
            Emoji are optional. Uncheck anything your house doesn&apos;t split; add others any time in Settings → Utilities.
          </p>
          <p className="s-hint s-ledger-only">
            You own these for now. Once your roommates join, reassign each one&apos;s owner in Settings → Utilities.
          </p>
        </fieldset>

        <fieldset className={`s-field ${themeFaces}`}>
          <legend className="s-label">Look</legend>
          <div className="s-choices">
            {THEMES.map((t) => (
              <label key={t} className="s-choice s-choice-theme">
                <ThemeSwatch value={t} />
                <span className="s-choice-row">
                  <input type="radio" name="theme" value={t} defaultChecked={t === DEFAULT_THEME} required />
                  <span>
                    <span className="s-choice-title">{THEME_CARDS[t].title}</span>
                    <span className="s-choice-blurb">{THEME_CARDS[t].note}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="s-hint">Everyone in the household sees it, and household email follows it. Change it any time in settings.</p>
        </fieldset>

        <div className="s-field">
          <label className="s-label" htmlFor="timezone">Time zone</label>
          <TimezoneSelect zones={Intl.supportedValuesOf("timeZone")} fallback="America/New_York" detect className="s-input" />
          <p className="s-hint">Reminder emails go out in the morning, in this time zone.</p>
        </div>

        <div>
          <SubmitButton className="s-btn" pendingLabel="Creating…">
            Create household
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
