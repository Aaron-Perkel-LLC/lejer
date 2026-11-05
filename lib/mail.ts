import { createHash } from "node:crypto";
import { type ReactElement, cloneElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { BRAND } from "@/lib/brand";
import { type TenantScope, type Tx, withHousehold, withUser } from "@/lib/db";
import type { MailKind } from "@/lib/mail-kinds";
import type { UnsubscribeLink } from "@/emails/Shell";
import type { Household } from "@/lib/types";
import { CATEGORY_OF, type UnsubscribeScope, unsubscribeLabel, unsubscribeUrl } from "@/lib/unsubscribe";

// Every outbound email goes through sendMail(). It returns false on failure (logged, never
// thrown) and writes one email_log row per attempt, the source of truth for the send ceilings
// (lib/mail-limits.ts) and the admin page's month-to-date. Two dev affordances, both impossible in production (VERCEL_ENV):
// - RESEND_API_KEY empty → "console mode": the message is printed with a [mail:console]
//   prefix instead of sent, and no email_log row is written. instrumentation.ts refuses to
//   boot production without a key, so codes can never land in production logs.
// - RESEND_TEST_SENDER=1 → From becomes onboarding@resend.dev (display name kept), for use
//   until the mail domain (BRAND.mailDomain) verifies. Resend only delivers that sender's mail to the Resend
//   account's own address.
// Every message is sent as HTML plus the plain-text rendering of the same template. A kind in
// lib/unsubscribe.ts CATEGORY_OF (reminders, notices, receipts, notes, digest copies) must come
// with its `unsubscribe` scope: it then carries List-Unsubscribe / List-Unsubscribe-Post
// (one-click) headers and the footer link, injected into the template's root element here so
// no send site builds them. Login codes, invites and deletion mail stay transactional.

export type { MailKind };

/** Kinds sent as "{BRAND.name}" <login@…> with no Reply-To. */
const ACCOUNT_KINDS: ReadonlySet<MailKind> = new Set(["login_code", "invite"]);
/**
 * Kinds sent as "{BRAND.name}" <hello@…> (the contact address): the operator's own mail, about
 * the service rather than a household, so replies land where people already write. Reply-To is
 * honored. Everything outside these two sets is household mail and needs a ctx.
 */
const SITE_KINDS: ReadonlySet<MailKind> = new Set(["operator_note", "waitlist_note"]);

const isProduction = () => process.env.VERCEL_ENV === "production";

export function consoleMode(): boolean {
  return !process.env.RESEND_API_KEY && !isProduction();
}

let client: Resend | undefined;
function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  return (client ??= new Resend(key));
}

function fromHeader(kind: MailKind, household?: Pick<Household, "name" | "fromName">): string {
  const test = process.env.RESEND_TEST_SENDER === "1" && !isProduction();
  if (ACCOUNT_KINDS.has(kind)) {
    return `${BRAND.name} <${test ? "onboarding@resend.dev" : BRAND.loginFrom}>`;
  }
  if (SITE_KINDS.has(kind)) {
    return `${BRAND.name} <${test ? "onboarding@resend.dev" : BRAND.contactEmail}>`;
  }
  if (!household) throw new Error(`household mail (${kind}) needs a household`);
  // Display names can't carry quotes or angle brackets unescaped; strip them.
  const name = `${household.fromName || household.name} via ${BRAND.name}`.replace(/["<>\\]/g, "");
  return `"${name}" <${test ? "onboarding@resend.dev" : BRAND.notifyFrom}>`;
}

export interface SendMailArgs {
  /** The household the mail is about (logs under it; names the From for household mail). */
  ctx?: TenantScope & { household: Pick<Household, "id" | "name" | "fromName" | "replyTo"> };
  to: string;
  subject: string;
  react: ReactElement;
  kind: MailKind;
  /** Household and site mail; account mail has none. Defaults to households.reply_to; reminders pass the bill owner. */
  replyTo?: string | null;
  /** Required for every kind in CATEGORY_OF: whose mail this is, for the unsubscribe headers and link. */
  unsubscribe?: UnsubscribeScope;
}

type HouseholdScope = NonNullable<SendMailArgs["ctx"]>;

interface Rendered {
  args: SendMailArgs;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/** RFC 8058: the one-click POST the provider sends to the List-Unsubscribe URL. */
export const ONE_CLICK = "List-Unsubscribe=One-Click";

/** The element to render: the template, given its unsubscribe link when the kind has one. */
async function withUnsubscribe(args: SendMailArgs): Promise<{ element: ReactElement; headers?: Record<string, string> }> {
  const category = CATEGORY_OF[args.kind];
  if (!category) return { element: args.react };
  if (!args.unsubscribe) throw new Error(`sendMail(${args.kind}) needs an unsubscribe scope`);
  if (args.unsubscribe.category !== category) throw new Error(`sendMail(${args.kind}): unsubscribe category ${args.unsubscribe.category}, expected ${category}`);
  const url = await unsubscribeUrl(args.unsubscribe);
  return {
    element: cloneElement(args.react as ReactElement<{ unsubscribe?: UnsubscribeLink }>, { unsubscribe: { url, label: unsubscribeLabel(category) } }),
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": ONE_CLICK },
  };
}

async function prepare(args: SendMailArgs): Promise<Rendered> {
  const { element, headers } = await withUnsubscribe(args);
  const text = await render(element, { plainText: true });
  if (consoleMode()) return { args, html: "", text, from: "", headers };
  const reply = ACCOUNT_KINDS.has(args.kind) ? undefined : (args.replyTo ?? args.ctx?.household.replyTo ?? undefined);
  return { args, html: await render(element), text, from: fromHeader(args.kind, args.ctx?.household), ...(reply ? { replyTo: reply } : {}), headers };
}

function printConsole({ args, text, headers }: Rendered): void {
  const unsub = headers ? `\n[mail:console] ${headers["List-Unsubscribe"]}` : "";
  console.log(`[mail:console] ${args.kind} to ${args.to}: ${args.subject}\n${text}${unsub}\n[mail:console] end`);
}

const hashTo = (to: string) => createHash("sha256").update(to.trim().toLowerCase()).digest("hex");

/** One email_log row per attempt, in its own short transaction, never RETURNING (see below). */
async function log(ctx: HouseholdScope | undefined, attempts: { kind: MailKind; to: string; ok: boolean }[]): Promise<void> {
  if (attempts.length === 0) return;
  // No RETURNING: a NULL-household row would have to pass email_log's SELECT policy, and fails.
  const rows = attempts.map((a) => ({ household_id: ctx?.household.id ?? null, kind: a.kind, to_hash: hashTo(a.to), ok: a.ok }));
  try {
    if (ctx) await withHousehold(ctx, (tx) => tx`INSERT INTO email_log ${tx(rows, "household_id", "kind", "to_hash", "ok")}`);
    else await withUser(null, (tx) => tx`INSERT INTO email_log ${tx(rows, "household_id", "kind", "to_hash", "ok")}`);
  } catch (err) {
    console.error(`email_log insert failed (${attempts[0].kind}):`, err);
  }
}

export async function sendMail(args: SendMailArgs): Promise<boolean> {
  const m = await prepare(args);
  if (consoleMode()) {
    printConsole(m);
    return true;
  }

  let ok = false;
  try {
    const { error } = await resend().emails.send({
      from: m.from,
      to: args.to,
      subject: args.subject,
      html: m.html,
      text: m.text,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
    });
    if (error) console.error(`sendMail(${args.kind}) failed for ${args.to}: ${error.name}: ${error.message}`);
    ok = !error;
  } catch (err) {
    console.error(`sendMail(${args.kind}) failed for ${args.to}:`, err);
  }
  await log(args.ctx, [{ kind: args.kind, to: args.to, ok }]);
  return ok;
}

/** Resend's batch endpoint takes at most this many messages per call. */
const BATCH_LIMIT = 100;

/**
 * Household mail in bulk (the reminder batch): Resend's batch endpoint, up to 100 per call, in
 * permissive mode so one bad address fails alone. Returns one ok per message, in order, and logs
 * one email_log row per message, like sendMail.
 */
export async function sendMailBatch(ctx: HouseholdScope, messages: Omit<SendMailArgs, "ctx">[]): Promise<boolean[]> {
  const prepared = await Promise.all(messages.map((m) => prepare({ ...m, ctx })));
  if (consoleMode()) {
    prepared.forEach(printConsole);
    return prepared.map(() => true);
  }

  const results: boolean[] = [];
  for (let i = 0; i < prepared.length; i += BATCH_LIMIT) {
    const chunk = prepared.slice(i, i + BATCH_LIMIT);
    let oks = chunk.map(() => false);
    try {
      const { data, error } = await resend().batch.send(
        chunk.map((m) => ({ from: m.from, to: m.args.to, subject: m.args.subject, html: m.html, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) })),
        { batchValidation: "permissive" },
      );
      if (error) console.error(`sendMailBatch failed (${chunk.length} messages): ${error.name}: ${error.message}`);
      else {
        const failed = new Set((data?.errors ?? []).map((e) => e.index));
        for (const e of data?.errors ?? []) console.error(`sendMailBatch: ${chunk[e.index]?.args.to} failed: ${e.message}`);
        oks = chunk.map((_, j) => !failed.has(j));
      }
    } catch (err) {
      console.error(`sendMailBatch failed (${chunk.length} messages):`, err);
    }
    results.push(...oks);
  }
  await log(ctx, prepared.map((m, i) => ({ kind: m.args.kind, to: m.args.to, ok: results[i] })));
  return results;
}

/**
 * The sending seam. Reminders, thanks and the cron take a Mailer so verify can pass a recorder
 * (a dev .env.local may hold a real RESEND_API_KEY); the app always uses this one.
 */
export interface Mailer {
  send: typeof sendMail;
  sendBatch: typeof sendMailBatch;
}

export const mailer: Mailer = { send: sendMail, sendBatch: sendMailBatch };

export { BULK_DAILY_LIMIT, CRON_DAILY_LIMIT, EMAIL_DAILY_CEILING, RESEND_MONTHLY_QUOTA } from "@/lib/mail-limits";

/** Account-wide sends since the start of now's UTC day (email_sends_since, a definer function). */
export async function sendsToday(tx: Tx, now: Date = new Date()): Promise<number> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [{ n }] = await tx<{ n: number }[]>`SELECT email_sends_since(${since}) AS n`;
  return n;
}
