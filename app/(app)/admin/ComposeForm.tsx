"use client";

import { useRef, useState } from "react";
import { BULK_DAILY_LIMIT } from "@/lib/mail-limits";
import { BODY_MAX, LINK_LABEL_MAX, SUBJECT_MAX } from "@/lib/operator-mail-limits";
import { count, num } from "./format";
import type { Audience, BudgetDto, FormAction, Picks } from "./types";

// The operator's compose form (lib/operator-mail.ts). The audience is chosen here, in the form:
// everyone who has joined, some households or some people (a checklist unfolds under the
// choice; the Email button on a row in Households or People ticks it from there), or the
// launch waitlist. "Send me a copy" posts straight away; "Send…" first resolves the audience
// here, with the same rules as the server, and asks in a dialog that names the count: the
// server resolves it again before anything goes out.

export interface ComposePerson {
  id: number;
  name: string;
  email: string;
  /** Joined households, by id; empty means unreachable (never signed in). */
  households: number[];
  /** Households they're invited to but haven't signed in for: a pick there counts them as skipped. */
  pending: number[];
  operator: boolean;
  mutedUpdates: boolean;
}

export interface ComposeHousehold {
  id: number;
  name: string;
  joinedCount: number;
}

interface Plan {
  audience: Audience;
  to: number;
  households: number;
  muted: number;
  skipped: number;
  told: number;
}

export default function ComposeForm({
  action,
  people,
  households,
  waitlist,
  audience,
  onAudience,
  picks,
  onPick,
  budget,
  contactEmail,
}: {
  action: FormAction;
  people: ComposePerson[];
  households: ComposeHousehold[];
  waitlist: { waiting: number; told: number };
  audience: Audience;
  onAudience: (a: Audience) => void;
  picks: Picks;
  onPick: (kind: "households" | "users", id: number) => void;
  budget: BudgetDto;
  contactEmail: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const intent = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);

  const reachable = (p: ComposePerson) => p.households.length > 0 && !p.operator;
  const why = (p: ComposePerson) => (p.operator ? "runs the site" : p.households.length === 0 ? "never signed in" : null);
  const everyone = people.filter((p) => reachable(p) && !p.mutedUpdates).length;

  /** The audience as the server will see it, for the confirm. */
  function resolve(): Plan {
    if (audience === "waitlist") return { audience, to: waitlist.waiting, households: 0, muted: 0, skipped: 0, told: waitlist.told };
    const want = audience === "households" ? new Set(picks.households) : audience === "users" ? new Set(picks.users) : null;
    const picked = people.filter((p) => (audience === "everyone" ? true : audience === "users" ? want!.has(p.id) : [...p.households, ...p.pending].some((h) => want!.has(h))));
    const hs = new Set<number>();
    let to = 0;
    let muted = 0;
    let skipped = 0;
    for (const p of picked) {
      if (!reachable(p)) skipped++;
      else if (p.mutedUpdates) muted++;
      else {
        to++;
        for (const h of p.households) if (audience !== "households" || want!.has(h)) hs.add(h);
      }
    }
    return { audience, to, households: hs.size, muted, skipped, told: 0 };
  }

  function ask() {
    const f = form.current!;
    if (!f.reportValidity()) return;
    setPlan(resolve());
    dialog.current?.showModal();
  }

  function confirm() {
    dialog.current?.close();
    intent.current!.value = "send";
    form.current!.requestSubmit();
  }

  const overToday = plan ? budget.today + plan.to > BULK_DAILY_LIMIT : false;

  return (
    <>
      <form id="compose" ref={form} action={action} className="s-form s-compose" onSubmit={() => setPending(true)}>
        <input type="hidden" name="intent" ref={intent} defaultValue="preview" />
        <fieldset className="s-compose-to">
          <legend className="s-label">To</legend>
          <label className="s-check">
            <input type="radio" name="audience" value="everyone" checked={audience === "everyone"} onChange={() => onAudience("everyone")} />
            <span>
              Everyone who has joined a household <span className="s-dim">· {count(everyone, "person", "people")}</span>
            </span>
          </label>
          <label className="s-check">
            <input type="radio" name="audience" value="households" checked={audience === "households"} onChange={() => onAudience("households")} />
            <span>
              Some households <span className="s-dim">· {picks.households.length === 0 ? "none ticked yet" : `${num(picks.households.length)} ticked`}</span>
            </span>
          </label>
          <div className="s-picklist" role="group" aria-label="Households to email" hidden={audience !== "households"}>
            {households.map((h) => {
              const reason = h.joinedCount === 0 ? "nobody has signed in" : null;
              return (
                <label key={h.id} className="s-pick" title={reason ?? undefined}>
                  <input type="checkbox" name="household" value={h.id} checked={picks.households.includes(h.id)} onChange={() => onPick("households", h.id)} disabled={!!reason} />
                  <span>
                    {h.name} <span className="s-dim">· {reason ?? count(h.joinedCount, "person", "people")}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <label className="s-check">
            <input type="radio" name="audience" value="users" checked={audience === "users"} onChange={() => onAudience("users")} />
            <span>
              Some people <span className="s-dim">· {picks.users.length === 0 ? "none ticked yet" : `${num(picks.users.length)} ticked`}</span>
            </span>
          </label>
          <div className="s-picklist" role="group" aria-label="People to email" hidden={audience !== "users"}>
            {people.map((p) => {
              const reason = why(p);
              return (
                <label key={p.id} className="s-pick" title={reason ? `${p.name} ${reason}` : p.email}>
                  <input type="checkbox" name="user" value={p.id} checked={picks.users.includes(p.id)} onChange={() => onPick("users", p.id)} disabled={!!reason} />
                  <span>
                    {p.name} <span className="s-dim">· {reason ?? (p.mutedUpdates ? "updates off" : p.email)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <label className="s-check">
            <input type="radio" name="audience" value="waitlist" checked={audience === "waitlist"} onChange={() => onAudience("waitlist")} disabled={waitlist.waiting === 0} />
            <span>
              The waitlist{" "}
              <span className="s-dim">
                · {waitlist.waiting === 0 ? (waitlist.told === 0 ? "empty" : `everyone told`) : `${count(waitlist.waiting, "address", "addresses")} waiting`}
                {waitlist.told > 0 && waitlist.waiting > 0 ? `, ${num(waitlist.told)} told` : ""}
              </span>
            </span>
          </label>
        </fieldset>
        <div className="s-field">
          <label className="s-label" htmlFor="compose-subject">
            Subject
          </label>
          <input className="s-input" id="compose-subject" name="subject" maxLength={SUBJECT_MAX} required />
        </div>
        <div className="s-field">
          <label className="s-label" htmlFor="compose-body">
            Message
          </label>
          <textarea className="s-input s-textarea" id="compose-body" name="body" rows={9} maxLength={BODY_MAX} required />
          <p className="s-hint">A blank line starts a new paragraph. Each copy opens with the person&apos;s name; a waitlist copy says &ldquo;Hi there&rdquo;.</p>
        </div>
        <div className="s-compose-grid">
          <div className="s-field">
            <label className="s-label" htmlFor="compose-link-label">
              Button label <span className="s-dim">(optional)</span>
            </label>
            <input className="s-input s-input-sm" id="compose-link-label" name="linkLabel" maxLength={LINK_LABEL_MAX} />
          </div>
          <div className="s-field">
            <label className="s-label" htmlFor="compose-link-url">
              Button address
            </label>
            <input className="s-input s-input-sm s-mono" id="compose-link-url" name="linkUrl" type="url" placeholder="https://" />
          </div>
          <div className="s-field">
            <label className="s-label" htmlFor="compose-reply">
              Replies go to
            </label>
            <input className="s-input s-input-sm s-mono" id="compose-reply" name="replyTo" type="email" defaultValue={contactEmail} />
          </div>
        </div>
        <div className="s-compose-actions">
          <button type="submit" name="intent" value="preview" className="s-btn s-btn-line s-btn-sm" disabled={pending} aria-busy={pending}>
            {pending ? "Sending…" : "Send me a copy"}
          </button>
          <button type="button" className="s-btn s-btn-sm" onClick={ask} disabled={pending}>
            Send…
          </button>
          <span className="s-hint">
            {num(budget.month)} sent this month of {num(budget.monthQuota)}; {num(budget.today)} today.
          </span>
        </div>
      </form>
      <dialog ref={dialog} className="s-dialog" aria-labelledby="compose-confirm-title">
        {plan && (
          <>
            <p className="s-h3" id="compose-confirm-title">
              {plan.audience === "waitlist"
                ? `Send to ${count(plan.to, "address", "addresses")} on the waitlist?`
                : `Send to ${count(plan.to, "person", "people")}${plan.households ? ` (${count(plan.households, "household")})` : ""}?`}
            </p>
            <p className="s-hint">
              {plan.muted > 0 ? `${count(plan.muted, "person has", "people have")} turned updates off and won't get it. ` : ""}
              {plan.skipped > 0 ? `${count(plan.skipped, "person", "people")} ticked can't be reached (never signed in, or runs the site). ` : ""}
              {plan.told > 0 ? `${num(plan.told)} already told won't get it again. ` : ""}
              {overToday
                ? `Only ${num(Math.max(0, BULK_DAILY_LIMIT - budget.today))} left under today's ceiling: this will be refused.`
                : plan.audience === "waitlist"
                  ? "Each copy carries a take-me-off-the-list link."
                  : "Each copy carries an unsubscribe link."}
            </p>
            <div className="s-dialog-actions">
              <button type="button" className="s-btn s-btn-sm" onClick={confirm} disabled={plan.to === 0}>
                Send
              </button>
              <button type="button" className="s-btn s-btn-line s-btn-sm" onClick={() => dialog.current?.close()}>
                Cancel
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
