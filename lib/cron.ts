import { timingSafeEqual } from "node:crypto";
import { adminSql, type TenantScope, withHousehold } from "@/lib/db";
import { expireRequest, hardDelete, sendDeletionMail } from "@/lib/deletion";
import { getCurrentHousehold } from "@/lib/households";
import { CRON_DAILY_LIMIT, type Mailer, mailer as defaultMailer, sendsToday } from "@/lib/mail";
import { batchConfirmationMessage, dueReminders, reminderMessage } from "@/lib/reminders";
import { type NoticeResult, flushBillNotices } from "@/lib/notices";
import { type ThanksResult, flushThanks } from "@/lib/thanks";
import { localDate, localHour } from "@/lib/time";
import type { Household } from "@/lib/types";

// The hourly tick (ARCHITECTURE.md §8): app/api/cron/tick calls tick(), scripts/send-reminders.ts
// calls tickHousehold() for one household. Transactions stay short (reads and stamps only; the
// pooler is PgBouncer in transaction mode), and every send happens outside them.
//
// The once-per-day guard is a claim: one atomic UPDATE moves last_send_date to today only if it
// is earlier (`<`, so moving to a timezone where it's still yesterday can't send twice, and a
// retried slow tick finds the day taken). A batch that can't go out (over budget, or every send
// failed) releases its claim with a compare-and-set, so it can never undo a later tick's claim.

/** The bearer check. "missing" when the server has no secret at all (misconfigured, not a bad caller). */
export function authorizeCron(header: string | null, secret = process.env.CRON_SECRET): "ok" | "missing" | "denied" {
  if (!secret) return "missing";
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "denied";
}

export interface TickOptions {
  now?: Date;
  mailer?: Mailer;
  /** CLI: run regardless of send_hour. */
  ignoreHour?: boolean;
  /** CLI --force: also skip the day claim and the budget. */
  force?: boolean;
}

export interface HouseholdTick {
  id: number;
  slug: string;
  thanks: ThanksResult;
  /** The new-bill email queue (lib/notices.ts), flushed every tick like thanks. */
  notices: NoticeResult;
  sent: number;
  failed: number;
  /** Why no batch ran: "reminders off", "before 9:00", "already sent today", "nothing due". */
  skipped?: string;
  deferred?: "budget";
  /** True when a batch was attempted (the 500 rule counts these). */
  tried: boolean;
  /** Marked for deletion and its day had come: the Blob prefix and every row are gone. */
  deleted?: boolean;
  /** An open deletion request lapsed this tick (everyone was emailed). */
  expired?: boolean;
}

/** One line for households.last_tick_outcome (0011), what /admin shows as the last tick. */
export function tickSummary(t: HouseholdTick): string {
  const parts: string[] = [];
  if (t.deleted) parts.push("deleted");
  else if (t.deferred) parts.push("deferred: budget");
  else if (t.skipped) parts.push(`skipped: ${t.skipped}`);
  else parts.push(`sent ${t.sent}${t.failed ? `, ${t.failed} failed` : ""}`);
  const queue = (name: string, q: { sent: number; failed: number }) => {
    if (q.sent || q.failed) parts.push(`${name} ${q.sent}${q.failed ? `, ${q.failed} failed` : ""}`);
  };
  queue("thanks", t.thanks);
  queue("notices", t.notices);
  if (t.expired) parts.push("deletion request lapsed");
  return parts.join("; ");
}

/**
 * One household's tick, under a system scope (no user), then its outcome stamped on the row
 * (its own short transaction; a deleted household has no row). An error is stamped too, then
 * rethrown for tick()'s report.
 */
export async function tickHousehold(householdId: number, opts: TickOptions = {}): Promise<HouseholdTick> {
  const scope: TenantScope = { household: { id: householdId }, user: null };
  const stamp = (outcome: string) =>
    withHousehold(scope, (tx) => tx`UPDATE households SET last_tick_outcome = ${outcome.slice(0, 500)} WHERE id = app_household_id()`).then(
      () => undefined,
      () => undefined, // the report matters more than the stamp
    );
  let out: HouseholdTick;
  try {
    out = await runTick(householdId, opts);
  } catch (e) {
    await stamp(`error: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  if (!out.deleted) await stamp(tickSummary(out));
  return out;
}

export interface FlushResult {
  thanks: ThanksResult;
  notices: NoticeResult;
  /** Why nothing ran: the household is marked for deletion (its queues wait for the undo). */
  skipped?: string;
}

const EMPTY_FLUSH = { thanks: { sent: 0, failed: 0, pending: 0 }, notices: { sent: 0, failed: 0, pending: 0 } } as const;

/**
 * Flushes one household's two queues (receipts, then bill emails) under a system scope: what the
 * tick does for every household, and what the ten-minute wake-up (lib/wake.ts, consumed by
 * app/api/queues/flush) does for one. Neither queue is ever deferred for the budget: each email
 * answers something a person just did. A household marked for deletion is read-only and sends
 * nothing. Stamps nothing: the tick's outcome line is the tick's.
 */
export async function flushHousehold(householdId: number, opts: { now?: Date; mailer?: Mailer } = {}): Promise<FlushResult> {
  const base: TenantScope = { household: { id: householdId }, user: null };
  const household = await withHousehold(base, (tx) => getCurrentHousehold(tx));
  if (!household) throw new Error(`household ${householdId} not found`);
  return flushFor({ household, user: null }, opts);
}

async function flushFor(scope: TenantScope & { household: Household & { deleteAfter: Date | null } }, opts: { now?: Date; mailer?: Mailer }): Promise<FlushResult> {
  if (scope.household.deleteAfter) return { ...EMPTY_FLUSH, skipped: "marked for deletion" };
  const now = opts.now ?? new Date();
  const mail = opts.mailer ?? defaultMailer;
  const thanks = await flushThanks(scope, { now, mailer: mail });
  const notices = await flushBillNotices(scope, { now, mailer: mail });
  return { thanks, notices };
}

async function runTick(householdId: number, opts: TickOptions): Promise<HouseholdTick> {
  const now = opts.now ?? new Date();
  const mail = opts.mailer ?? defaultMailer;
  const base: TenantScope = { household: { id: householdId }, user: null };

  const household = await withHousehold(base, async (tx) => {
    await tx`UPDATE households SET last_run_at = ${now} WHERE id = app_household_id()`;
    return getCurrentHousehold(tx);
  });
  if (!household) throw new Error(`household ${householdId} not found`);
  const scope = { household, user: null };
  const out: HouseholdTick = { id: household.id, slug: household.slug, ...EMPTY_FLUSH, sent: 0, failed: 0, tried: false };

  // Deletion (lib/deletion.ts) comes first. A marked household whose day has come is deleted; one
  // still in its week is read-only and sends nothing (its queues wait, so an undo resumes them).
  if (household.deleteAfter) {
    if (await hardDelete(household.id)) return { ...out, deleted: true };
    return { ...out, skipped: "marked for deletion" };
  }
  if (household.deletionRequestedAt && (await expireRequest(scope))) {
    out.expired = true;
    await sendDeletionMail(scope, { event: "expired", actor: null }, { mailer: mail });
  }

  ({ thanks: out.thanks, notices: out.notices } = await flushFor(scope, { now, mailer: mail }));

  if (!household.remindersEnabled && !opts.force) return { ...out, skipped: "reminders off" };
  const today = localDate(household.timezone, now);
  if (!opts.ignoreHour && !opts.force && localHour(household.timezone, now) < household.sendHour) {
    return { ...out, skipped: `before ${household.sendHour}:00` };
  }

  // Claim the day. `previous` is what to put back if this batch can't go out.
  let previous: string | null = null;
  if (!opts.force) {
    const claim = await withHousehold(scope, (tx) => tx<{ previous: string | null }[]>`
      WITH prev AS (SELECT last_send_date FROM households WHERE id = app_household_id() FOR UPDATE)
      UPDATE households h SET last_send_date = ${today}
      FROM prev
      WHERE h.id = app_household_id() AND (h.last_send_date IS NULL OR h.last_send_date < ${today})
      RETURNING prev.last_send_date AS previous`);
    if (claim.length === 0) return { ...out, skipped: "already sent today" };
    previous = claim[0].previous;
  }
  const release = () =>
    opts.force
      ? Promise.resolve()
      : withHousehold(scope, (tx) => tx`
          UPDATE households SET last_send_date = ${previous}
          WHERE id = app_household_id() AND last_send_date = ${today}`).then(() => undefined);

  const { due, used } = await withHousehold(scope, async (tx) => ({
    due: await dueReminders(tx, household, today),
    used: opts.force ? 0 : await sendsToday(tx, now),
  }));
  if (due.length === 0) return { ...out, skipped: "nothing due" }; // the stamp stays: the day is done

  const batchSize = due.length + (household.digestEmail ? 1 : 0);
  if (!opts.force && used + batchSize > CRON_DAILY_LIMIT) {
    await release();
    return { ...out, deferred: "budget" };
  }

  out.tried = true;
  const oks = await mail.sendBatch(scope, due.map((r) => reminderMessage(household, r)));
  const sent = due.filter((_, i) => oks[i]);
  out.sent = sent.length;
  out.failed = due.length - sent.length;

  if (out.sent === 0) {
    await release(); // nothing went out: the next tick retries
    return out;
  }
  await withHousehold(scope, (tx) => tx`
    UPDATE households SET last_send_date = greatest(coalesce(last_send_date, ${today}), ${today}),
      last_sent_at = ${now}, last_sent_count = ${out.sent}
    WHERE id = app_household_id()`);
  if (household.digestEmail) await mail.send({ ctx: scope, ...batchConfirmationMessage(household, today, sent, out.failed) });
  return out;
}

export interface TickReport {
  households: (HouseholdTick | { id: number; slug: string; error: string })[];
  /** 500 when every household that tried to send failed, so the Actions run goes red. */
  status: 200 | 500;
}

/**
 * Every household (or just `only`, which verify uses so it never ticks the seed households).
 * The enumeration is one of the owner-role call sites (CLAUDE.md): RLS would hide every
 * household from a scope that doesn't name one yet.
 */
export async function tick(opts: TickOptions & { only?: number[] } = {}): Promise<TickReport> {
  const sql = adminSql();
  const rows = opts.only
    ? await sql<{ id: number; slug: string }[]>`SELECT id, slug FROM households WHERE id = ANY(${opts.only}) ORDER BY id`
    : await sql<{ id: number; slug: string }[]>`SELECT id, slug FROM households ORDER BY id`;

  const households: TickReport["households"] = [];
  for (const h of rows) {
    try {
      households.push(await tickHousehold(h.id, opts));
    } catch (e) {
      console.error(`tick: household ${h.slug} failed:`, e);
      households.push({ id: h.id, slug: h.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const tried = households.filter((h) => "error" in h || h.tried);
  const allFailed = tried.length > 0 && tried.every((h) => "error" in h || (h.sent === 0 && h.failed > 0));
  return { households, status: allFailed ? 500 : 200 };
}
