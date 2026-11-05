import type { Metadata } from "next";
import Link from "next/link";
import SubmitButton from "@/app/components/SubmitButton";
import { BRAND } from "@/lib/brand";
import { CATEGORY_LABEL, describeUnsubscribe, isUserScope, isWaitlistScope, readUnsubscribe } from "@/lib/unsubscribe";
import { unsubscribeAction } from "./actions";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

// Where an email's footer link lands (lib/unsubscribe.ts): one question, one button, no sign-in.
// It names the household (or the product, for the operator's updates) and the kind of mail the token covers and changes nothing until the
// button is pressed (the one-click POST from a mail provider goes to /api/unsubscribe instead).
// A waitlist token (0018) is the one case with no account behind it: the button takes the
// address off the list, and there is no account page to point at.
// A bad or stale token gets a plain "this link doesn't work" rather than a 404 page, since the
// person arrived from an email and needs a next step (the account page).
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const k = one(sp.k) ?? "";
  const done = one(sp.done);
  const scope = await readUnsubscribe(k);
  const target = scope ? await describeUnsubscribe(scope) : null;

  return (
    <main className="s-wrap s-account s-unsubscribe">
      <span className="s-key">Email settings</span>
      {!scope || !target ? (
        <>
          <h1 className="s-h1">This link doesn&apos;t work any more.</h1>
          <p className="s-lede">
            It may belong to a household you&apos;ve left. You can change which emails you get from any household on your{" "}
            <Link href="/account">account page</Link>.
          </p>
        </>
      ) : isWaitlistScope(scope) ? (
        done !== undefined || target.alreadyOff ? (
          <>
            <h1 className="s-h1">{done !== undefined ? "Done." : "You're not on the list."}</h1>
            <p className="s-lede">
              {scope.waitlistEmail} is off the {BRAND.name} waitlist, so nothing more will come. If you change your mind, the home page takes
              sign-ups any time.
            </p>
          </>
        ) : (
          <>
            <h1 className="s-h1">Take {scope.waitlistEmail} off the waitlist?</h1>
            <p className="s-lede">
              You asked to hear when {BRAND.name} opened, and that one note is all the list is for. Press the button and it stops here.
            </p>
            <form action={unsubscribeAction}>
              <input type="hidden" name="k" value={k} />
              <SubmitButton className="s-btn" pendingLabel="Taking you off…">
                Take me off the list
              </SubmitButton>
            </form>
          </>
        )
      ) : done !== undefined ? (
        <>
          <h1 className="s-h1">Done.</h1>
          <p className="s-lede">
            {done === "1"
              ? `You won't get ${CATEGORY_LABEL[target.category]} from ${target.source} any more.`
              : `That membership is gone, so there was nothing left to turn off.`}{" "}
            Sign-in codes{isUserScope(scope) ? "" : " and notices about the household itself"} still arrive. Turn this back on any time from your{" "}
            <Link href="/account">account page</Link>.
          </p>
        </>
      ) : (
        <>
          <h1 className="s-h1">Stop {CATEGORY_LABEL[target.category]} from {target.source}?</h1>
          <p className="s-lede">
            {target.alreadyOff
              ? `They're already off${target.memberName ? ` for ${target.memberName}` : ""}. Pressing the button changes nothing.`
              : target.memberName
                ? `${target.memberName}, you'll stop getting ${CATEGORY_LABEL[target.category]} from ${target.source}. Everything else, sign-in codes included, still arrives.`
                : `${target.source}'s digest address will stop getting copies. An admin can set a new one in Settings.`}
          </p>
          <form action={unsubscribeAction}>
            <input type="hidden" name="k" value={k} />
            <SubmitButton className="s-btn" pendingLabel="Turning off…">
              Unsubscribe
            </SubmitButton>
          </form>
          <p className="s-hint">
            Or keep them and change which emails you get on your <Link href="/account">account page</Link> at {BRAND.name}.
          </p>
        </>
      )}
    </main>
  );
}
