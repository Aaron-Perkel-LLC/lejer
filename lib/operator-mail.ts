import { createElement } from "react";
import OperatorNote from "@/emails/OperatorNote";
import { type AdminUser, selectUserMutes, selectUsers } from "@/lib/admin";
import { BRAND } from "@/lib/brand";
import { type Tx, withUser } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/login-codes";
import { BULK_DAILY_LIMIT, type Mailer, mailer as defaultMailer, sendsToday } from "@/lib/mail";
import { BODY_MAX, LINK_LABEL_MAX, SUBJECT_MAX } from "@/lib/operator-mail-limits";
import { superadminEmails } from "@/lib/superadmin";
import type { User } from "@/lib/types";
import type { UnsubscribeScope } from "@/lib/unsubscribe";

// The operator's email from /admin (ARCHITECTURE.md §4 "The operator's mail"): a note about the
// service to picked households, picked people, everyone who has joined, or the launch waitlist
// (0018). Not household mail: it runs under withUser(operator), reads addresses through
// admin_users() like the page (the waitlist straight from its table: global, no RLS), sends as
// "{BRAND.name}" <hello@…> with no ctx (email_log rows have no household), and carries an
// unsubscribe link: user-scoped (`updates`, users.muted_kinds) for accounts, and for a waitlist
// address a take-me-off link that deletes its row. The waitlist gets each note once: a send
// stamps notified_at, and the audience is the addresses without one. For service updates only;
// a promotional mailing would need a postal address in the footer first (CAN-SPAM), which no
// template has.

export { BODY_MAX, LINK_LABEL_MAX, SUBJECT_MAX };
/** Resend allows 2 requests a second; sends are paced this far apart. */
export const PACE_MS = 600;

export type Audience =
  | { kind: "everyone" }
  | { kind: "households"; ids: number[] }
  | { kind: "users"; ids: number[] }
  | { kind: "waitlist" };

export const AUDIENCE_KINDS: readonly Audience["kind"][] = ["everyone", "households", "users", "waitlist"];
export const isAudienceKind = (v: unknown): v is Audience["kind"] => AUDIENCE_KINDS.includes(v as Audience["kind"]);

export interface OperatorNoteInput {
  subject: string;
  body: string;
  /** Both or neither; https only. */
  linkLabel?: string;
  linkUrl?: string;
  /** Where replies go; the contact address unless the operator says otherwise. */
  replyTo?: string;
}

export interface Recipient {
  /** The account; null for a waitlist address, which has none. */
  userId: number | null;
  /** Null for a waitlist address: the note opens "Hi there," instead. */
  name: string | null;
  email: string;
}

export interface AudienceReport {
  to: Recipient[];
  /** Joined households the recipients are in (within the picked ones, for a households audience). */
  households: number;
  /** Picked, reachable, but turned updates off: they get nothing and the operator is told. */
  muted: number;
  /** Picked but unreachable: never joined a household (an unproven address), or runs the site. */
  skipped: number;
  /** Waitlist only: addresses already told (notified_at set), which get nothing more. */
  told: number;
}

const joinedIn = (u: Pick<AdminUser, "memberships">) => u.memberships.filter((m) => m.joinedAt !== null).map((m) => m.householdId);

/**
 * Who an audience comes to. A person is reachable only with a joined membership (the same rule
 * as household mail: an invite-only address is unproven), never when they run the site, and
 * once however many picked households they're in. The waitlist is every address not yet told.
 */
export async function resolveAudience(tx: Tx, a: Audience): Promise<AudienceReport> {
  if (a.kind === "waitlist") {
    const rows = await tx<{ email: string; notifiedAt: Date | null }[]>`SELECT email, notified_at AS "notifiedAt" FROM waitlist ORDER BY created_at, email`;
    return {
      to: rows.filter((w) => w.notifiedAt === null).map((w) => ({ userId: null, name: null, email: w.email })),
      households: 0,
      muted: 0,
      skipped: 0,
      told: rows.filter((w) => w.notifiedAt !== null).length,
    };
  }
  const [users, mutes] = await Promise.all([selectUsers(tx), selectUserMutes(tx)]);
  const mutedIds = new Set(mutes.filter((m) => m.muted.includes("updates")).map((m) => m.id));
  const operators = superadminEmails();
  const want = a.kind === "everyone" ? null : new Set(a.ids);
  // A household pick takes everyone with a seat there, invited included, so the pending ones
  // show up as skipped rather than silently missing.
  const picked = users.filter((u) => {
    if (a.kind === "everyone") return true;
    if (a.kind === "users") return want!.has(u.id);
    return u.memberships.some((m) => want!.has(m.householdId));
  });
  const report: AudienceReport = { to: [], households: 0, muted: 0, skipped: 0, told: 0 };
  const households = new Set<number>();
  for (const u of picked.sort((x, y) => x.name.localeCompare(y.name))) {
    const joined = joinedIn(u);
    if (joined.length === 0 || operators.has(normalizeEmail(u.email) ?? "")) {
      report.skipped++;
      continue;
    }
    if (mutedIds.has(u.id)) {
      report.muted++;
      continue;
    }
    report.to.push({ userId: u.id, name: u.name, email: u.email });
    for (const id of joined) if (a.kind !== "households" || want!.has(id)) households.add(id);
  }
  report.households = households.size;
  return report;
}

export interface OperatorNoteReport extends Omit<AudienceReport, "to"> {
  sent: number;
  failed: number;
  preview: boolean;
  /** Which audience it went to, so the flash can say "addresses" for the waitlist. */
  audience: Audience["kind"];
}

/** The validated message, or an ActionError listing what's wrong, one line each. */
export function parseOperatorNote(raw: OperatorNoteInput): { subject: string; body: string; link: { label: string; url: string } | null; replyTo: string } {
  const subject = raw.subject.trim();
  const body = raw.body.trim();
  const linkLabel = (raw.linkLabel ?? "").trim();
  const linkUrl = (raw.linkUrl ?? "").trim();
  const replyRaw = (raw.replyTo ?? "").trim();
  const errors: string[] = [];
  if (!subject) errors.push("Add a subject.");
  else if (subject.length > SUBJECT_MAX) errors.push(`Keep the subject to ${SUBJECT_MAX} characters.`);
  if (!body) errors.push("Write the message.");
  else if (body.length > BODY_MAX) errors.push(`Keep the message to ${BODY_MAX.toLocaleString("en-US")} characters.`);
  let link: { label: string; url: string } | null = null;
  if (linkLabel || linkUrl) {
    let url: URL | null = null;
    try {
      url = new URL(linkUrl);
    } catch {
      url = null;
    }
    if (!linkLabel || linkLabel.length > LINK_LABEL_MAX) errors.push(`Give the button a label of up to ${LINK_LABEL_MAX} characters.`);
    if (!url || url.protocol !== "https:") errors.push("The button needs an https:// address.");
    if (url && linkLabel) link = { label: linkLabel, url: url.href };
  }
  const replyTo = replyRaw ? normalizeEmail(replyRaw) : BRAND.contactEmail;
  if (!replyTo) errors.push("The reply address isn't a valid email address.");
  if (errors.length) throw new ActionError(errors.join("\n"));
  return { subject, body, link, replyTo: replyTo! };
}

/** Why there is nobody to send to, in the operator's terms. */
function nobody(audience: Audience, report: AudienceReport): string {
  if (audience.kind === "waitlist") return report.told > 0 ? "Everyone on the waitlist has been told already." : "The waitlist is empty.";
  if (audience.kind === "everyone") return "Nobody has joined a household yet, so there's no one to email.";
  return `Nobody to email: ${audience.kind === "households" ? "tick a household" : "tick a person"} whose members have signed in${report.muted ? " and haven't turned updates off" : ""}.`;
}

/**
 * Sends the note to the audience, one message at a time, paced for Resend. `preview` sends the
 * operator one copy (addressed to them, worded for the audience) and nothing else. Refuses when
 * today's account-wide sends plus the batch would pass BULK_DAILY_LIMIT, so reminders and sign-in
 * codes keep their room. A waitlist address is stamped notified_at as soon as its copy goes out.
 */
export async function sendOperatorNote(
  operator: User,
  raw: OperatorNoteInput,
  audience: Audience,
  opts: {
    preview?: boolean;
    now?: Date;
    mailer?: Mailer;
    paceMs?: number;
    /** Verify only (like tick's `only`): keep just these recipients, so a suite never touches the dev data's real rows. */
    only?: (r: Recipient) => boolean;
  } = {},
): Promise<OperatorNoteReport> {
  const msg = parseOperatorNote(raw);
  const now = opts.now ?? new Date();
  const mail = opts.mailer ?? defaultMailer;
  const preview = opts.preview === true;
  const waitlist = audience.kind === "waitlist";
  const { report, used } = await withUser(operator.id, async (tx) => ({
    report: await resolveAudience(tx, audience),
    used: await sendsToday(tx, now),
  }));
  const to: Recipient[] = preview ? [{ userId: operator.id, name: waitlist ? null : operator.name, email: operator.email }] : opts.only ? report.to.filter(opts.only) : report.to;
  if (to.length === 0) throw new ActionError(nobody(audience, report));
  if (used + to.length > BULK_DAILY_LIMIT) {
    throw new ActionError(
      `Today's sends are near the app's own ceiling (${used.toLocaleString("en-US")} of ${BULK_DAILY_LIMIT.toLocaleString("en-US")} spent, ${to.length.toLocaleString("en-US")} to send), and what's left is saved for reminders and sign-in codes. Try again after midnight UTC, or pick fewer people.`,
    );
  }

  const scopeFor = (r: Recipient): UnsubscribeScope =>
    waitlist ? { waitlistEmail: r.email, category: "waitlist" } : { userId: r.userId!, category: "updates" };
  let sent = 0;
  let failed = 0;
  for (const [i, r] of to.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, opts.paceMs ?? PACE_MS));
    const ok = await mail.send({
      to: r.email,
      subject: msg.subject,
      kind: waitlist ? "waitlist_note" : "operator_note",
      replyTo: msg.replyTo,
      unsubscribe: scopeFor(r),
      react: createElement(OperatorNote, { recipientName: r.name, subject: msg.subject, body: msg.body, link: msg.link, contact: msg.replyTo }),
    });
    if (ok) sent++;
    else failed++;
    if (ok && waitlist && !preview) {
      await withUser(operator.id, (tx) => tx`UPDATE waitlist SET notified_at = ${now} WHERE email = ${r.email} AND notified_at IS NULL`);
    }
  }
  return { sent, failed, preview, audience: audience.kind, households: report.households, muted: report.muted, skipped: report.skipped, told: report.told };
}
