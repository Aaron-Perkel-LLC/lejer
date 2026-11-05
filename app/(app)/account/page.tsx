import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CalendarLinks from "@/app/components/CalendarLinks";
import CopyField from "@/app/components/CopyField";
import Flash from "@/app/components/Flash";
import SubmitButton from "@/app/components/SubmitButton";
import { getMyHouseholds, getSessionUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { listMyCalendarTokens } from "@/lib/households";
import { calendarLinks } from "@/lib/ics";
import { BRAND } from "@/lib/brand";
import { CATEGORY_LABEL, MEMBER_CATEGORIES, USER_CATEGORIES, getUserMutedKinds } from "@/lib/unsubscribe";
import { resetCalendarLink, updateMailPrefs, updateMyName, updateSiteMailPrefs } from "./actions";

export const metadata: Metadata = { title: "Account" };

const LINE = "s-btn s-btn-sm s-btn-line";

// You, across households: your name, which household emails you get, and your calendar link in
// each household you've joined.
// In the public site's look (SiteShell): this page belongs to no household.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { ok, err } = await searchParams;
  const [households, { tokens, muted }] = await Promise.all([
    getMyHouseholds(),
    withUser(user.id, async (tx) => ({ tokens: await listMyCalendarTokens(tx, user.id), muted: await getUserMutedKinds(tx, user.id) })),
  ]);
  const label = (c: keyof typeof CATEGORY_LABEL) => CATEGORY_LABEL[c][0].toUpperCase() + CATEGORY_LABEL[c].slice(1);
  const calendars = households.flatMap((h) => {
    const token = tokens.get(h.id);
    return token ? [{ ...h, token }] : [];
  });

  return (
    <main className="s-wrap s-account">
      <span className="s-key">{user.email}</span>
      <h1 className="s-h1">Account</h1>
      <Flash ok={ok} err={err} site />

      <form action={updateMyName} className="s-form">
        <div className="s-field">
          <label className="s-label" htmlFor="name">Your name</label>
          <div className="s-signup-row">
            <input className="s-input" id="name" name="name" defaultValue={user.name} maxLength={80} required />
            <SubmitButton className="s-btn" pendingLabel="Saving…">Save</SubmitButton>
          </div>
          <p className="s-hint">Shown to everyone in every household you&apos;re in.</p>
        </div>
      </form>

      <section className="s-card" aria-labelledby="mail-heading-site">
        <div>
          <h2 id="mail-heading-site" className="s-h3">
            Email from {BRAND.name}
          </h2>
          <p className="s-prose">
            An occasional note from whoever runs {BRAND.name} about changes to the service. Sign-in codes always arrive.
          </p>
        </div>
        <form action={updateSiteMailPrefs} className="s-form s-form-tight">
          {USER_CATEGORIES.map((c) => (
            <label key={c} className="s-check">
              <input type="checkbox" name="on" value={c} defaultChecked={!muted.includes(c)} />
              <span>{label(c)}</span>
            </label>
          ))}
          <div>
            <SubmitButton className={LINE} pendingLabel="Saving…">Save email settings</SubmitButton>
          </div>
        </form>
      </section>

      {households.filter((h) => h.joinedAt).map((h) => (
        <section key={h.id} className="s-card" aria-labelledby={`mail-heading-${h.id}`}>
          <div>
            <h2 id={`mail-heading-${h.id}`} className="s-h3">
              Email from {h.name}
            </h2>
            <p className="s-prose">
              Sign-in codes and notices about the household being deleted always arrive. Everything else is up to you.
            </p>
          </div>
          <form action={updateMailPrefs} className="s-form s-form-tight">
            <input type="hidden" name="householdId" value={h.id} />
            {MEMBER_CATEGORIES.map((c) => (
              <label key={c} className="s-check">
                <input type="checkbox" name="on" value={c} defaultChecked={!h.mutedKinds.includes(c)} />
                <span>{label(c)}</span>
              </label>
            ))}
            <div>
              <SubmitButton className={LINE} pendingLabel="Saving…">Save email settings</SubmitButton>
            </div>
          </form>
        </section>
      ))}

      {calendars.map((h) => (
        <section key={h.id} className="s-card" aria-labelledby={`calendar-heading-${h.id}`}>
          <div>
            <h2 id={`calendar-heading-${h.id}`} className="s-h3">
              Calendar · {h.name}
            </h2>
            <p className="s-prose">
              Every bill&apos;s due date in your own calendar, saying what you owe and to whom. It updates on its own.
            </p>
          </div>
          <CalendarLinks token={h.token} buttonClass={LINE} />
          <CopyField
            id={`calendar-url-${h.id}`}
            label="Or paste this link into any calendar app"
            value={calendarLinks(h.token).https}
            labelClass="s-label"
            inputClass="s-input s-mono s-input-sm"
            buttonClass={LINE}
          />
          <div className="s-card-foot">
            <p className="s-hint">
              The link is yours alone. If it ends up somewhere it shouldn&apos;t, reset it: the old link stops working right
              away, and nobody else&apos;s changes.
            </p>
            <form action={resetCalendarLink}>
              <input type="hidden" name="householdId" value={h.id} />
              <SubmitButton className={LINE} pendingLabel="Resetting…">Reset my calendar link</SubmitButton>
            </form>
          </div>
        </section>
      ))}

    </main>
  );
}
