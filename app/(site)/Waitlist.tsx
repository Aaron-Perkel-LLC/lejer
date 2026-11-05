"use client";

import { useActionState } from "react";
import { joinWaitlist, type WaitlistState } from "./waitlist-actions";

// The coming-soon page's waitlist. Joining writes a row and sends nothing, so the button
// promises a place on the list, not an email. The heading is the form's visible label; the
// field's own label is for assistive tech (as in Signup).
export default function Waitlist() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, null);
  return (
    <section className="s-waitlist" aria-labelledby="waitlist-title">
      {state?.ok ? (
        <div role="status">
          <h2 className="s-h3" id="waitlist-title">
            You&apos;re on the list.
          </h2>
          <p className="s-hint">{state.message}</p>
        </div>
      ) : (
        <form action={action} className="s-signup">
          <h2 className="s-h3" id="waitlist-title">
            Want to know when it&apos;s ready?
          </h2>
          <label htmlFor="waitlist-email" className="sr-only">
            Your email address
          </label>
          <div className="s-signup-row">
            <input className="s-input" type="email" id="waitlist-email" name="email" autoComplete="email" placeholder="you@example.com" required />
            <button type="submit" className="s-btn" disabled={pending}>
              {pending ? "Adding…" : "Join the list"}
            </button>
          </div>
          {state ? (
            <p className="s-hint" role="alert">
              {state.message}
            </p>
          ) : (
            <p className="s-hint">One note when it opens, and nothing else.</p>
          )}
        </form>
      )}
    </section>
  );
}
