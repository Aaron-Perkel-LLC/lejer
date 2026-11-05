import { createElement } from "react";
import HouseholdDeletion, { type DeletionEvent, deletionSubject } from "@/emails/HouseholdDeletion";
import { assertAdmin, assertWritable, householdDate } from "@/lib/auth";
import { refreshBillStatus } from "@/lib/bills";
import { deletePrefix, householdPrefix } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { type TenantScope, type Tx, withHousehold } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { type Mailer, mailer as defaultMailer } from "@/lib/mail";
import type { Household } from "@/lib/types";

// Deleting a household, and leaving one (0009, ARCHITECTURE.md §5 "Deleting a household and
// leaving", decided 2026-10-12).
//
// - The only joined member deletes by typing the household's name. Anyone else's household
//   needs a vote: an admin requests, every joined member approves (pending invites don't vote),
//   one cancel ends it, and it lapses after REQUEST_DAYS. Voters are whoever has joined at each
//   check, so someone who joins mid-vote has to approve too, and someone leaving can complete it.
// - Either way the household is then *marked*: read-only (readOnlyReason in lib/auth.ts) for
//   GRACE_DAYS, any admin can undo, and the cron's hardDelete removes its Blob prefix, then the
//   row (everything cascades; email_log rows outlive it with no household, for the budget).
// - Every function locks the household row first, so two approvals (or an approval and a
//   leave) can't both miss the last vote. Mail goes out after commit (sendDeletionMail).

export const REQUEST_DAYS = 14;
export const GRACE_DAYS = 7;

/** Locks the household row and reads where deletion stands. Every mutation starts here. */
async function lock(tx: Tx) {
  const [row] = await tx<{ requestedAt: Date | null; active: boolean; deleteAfter: Date | null; due: boolean }[]>`
    SELECT deletion_requested_at AS "requestedAt",
           coalesce(deletion_requested_at > now() - make_interval(days => ${REQUEST_DAYS}), false) AS active,
           delete_after AS "deleteAfter", coalesce(delete_after <= now(), false) AS due
    FROM households WHERE id = app_household_id() FOR UPDATE`;
  if (!row) throw new ActionError("That household no longer exists.");
  return row;
}

async function joinedCount(tx: Tx): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`
    SELECT count(*) AS n FROM memberships WHERE household_id = app_household_id() AND joined_at IS NOT NULL`;
  return n;
}

/** Marks the household for deletion (the request, if any, is done with). */
async function mark(tx: Tx): Promise<Date> {
  await tx`DELETE FROM deletion_approvals WHERE household_id = app_household_id()`;
  const [{ deleteAfter }] = await tx<{ deleteAfter: Date }[]>`
    UPDATE households SET delete_after = now() + make_interval(days => ${GRACE_DAYS}),
      deletion_requested_at = NULL, deletion_requested_by = NULL
    WHERE id = app_household_id()
    RETURNING delete_after AS "deleteAfter"`;
  return deleteAfter;
}

async function clearRequest(tx: Tx): Promise<void> {
  await tx`DELETE FROM deletion_approvals WHERE household_id = app_household_id()`;
  await tx`UPDATE households SET deletion_requested_at = NULL, deletion_requested_by = NULL WHERE id = app_household_id()`;
}

/**
 * Marks the household once an open request has every joined member's approval. Called after
 * every vote and every change to who has joined (a removal, someone leaving). Returns when it
 * will be deleted, or null when the vote isn't complete (or there is none).
 */
export async function settle(tx: Tx): Promise<Date | null> {
  const row = await lock(tx);
  if (!row.active) return null;
  const [{ waiting }] = await tx<{ waiting: number }[]>`
    SELECT count(*) AS waiting FROM memberships m
    WHERE m.household_id = app_household_id() AND m.joined_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM deletion_approvals a WHERE a.household_id = m.household_id AND a.membership_id = m.id)`;
  return waiting === 0 ? mark(tx) : null;
}

export interface Voter {
  id: number;
  name: string;
  approved: boolean;
}

export interface DeletionState {
  /** An open request (lapsed ones read as none). */
  request: { requestedAt: Date; expiresAt: Date; requestedBy: string | null; voters: Voter[] } | null;
  deleteAfter: Date | null;
}

/** Where deletion stands, for the banner. One statement; only read while one is in progress. */
export async function getDeletionState(tx: Tx): Promise<DeletionState> {
  const [row] = await tx<{ requestedAt: Date | null; expiresAt: Date | null; active: boolean; deleteAfter: Date | null; requestedBy: string | null; voters: Voter[] }[]>`
    SELECT h.deletion_requested_at AS "requestedAt",
           h.deletion_requested_at + make_interval(days => ${REQUEST_DAYS}) AS "expiresAt",
           coalesce(h.deletion_requested_at > now() - make_interval(days => ${REQUEST_DAYS}), false) AS active,
           h.delete_after AS "deleteAfter",
           (SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = h.deletion_requested_by) AS "requestedBy",
           coalesce((
             SELECT json_agg(json_build_object('id', m.id, 'name', u.name, 'approved', a.membership_id IS NOT NULL) ORDER BY u.name)
             FROM memberships m JOIN users u ON u.id = m.user_id
             LEFT JOIN deletion_approvals a ON a.household_id = m.household_id AND a.membership_id = m.id
             WHERE m.household_id = h.id AND m.joined_at IS NOT NULL), '[]') AS voters
    FROM households h WHERE h.id = app_household_id()`;
  if (!row) return { request: null, deleteAfter: null };
  return {
    request: row.active && row.requestedAt && row.expiresAt
      ? { requestedAt: row.requestedAt, expiresAt: row.expiresAt, requestedBy: row.requestedBy, voters: row.voters }
      : null,
    deleteAfter: row.deleteAfter,
  };
}

/** The only joined member deletes by typing the household's name. Returns when it goes. */
export async function deleteAlone(tx: Tx, ctx: Ctx, typedName: string): Promise<Date> {
  assertAdmin(ctx);
  await lock(tx);
  if ((await joinedCount(tx)) > 1) {
    throw new ActionError(`Others have joined ${ctx.household.name}, so deleting it needs everyone's approval. Ask everyone instead.`);
  }
  if (typedName.trim() !== ctx.household.name.trim()) {
    throw new ActionError(`Type the household's name exactly as it's shown (${ctx.household.name}) to delete it.`);
  }
  return mark(tx);
}

export type RequestOutcome = { kind: "requested"; expiresAt: Date } | { kind: "marked"; deleteAfter: Date };

/** An admin asks everyone to approve deleting the household; the request counts as their approval. */
export async function requestDeletion(tx: Tx, ctx: Ctx): Promise<RequestOutcome> {
  assertAdmin(ctx);
  const row = await lock(tx);
  if (row.active) throw new ActionError(`There's already a request to delete ${ctx.household.name}.`);
  if ((await joinedCount(tx)) <= 1) {
    throw new ActionError(`You're the only one who has joined ${ctx.household.name}, so there's nobody to ask: type its name to delete it.`);
  }
  await tx`DELETE FROM deletion_approvals WHERE household_id = app_household_id()`; // a lapsed request's
  const [{ expiresAt }] = await tx<{ expiresAt: Date }[]>`
    UPDATE households SET deletion_requested_at = now(), deletion_requested_by = ${ctx.membership.id}
    WHERE id = app_household_id()
    RETURNING deletion_requested_at + make_interval(days => ${REQUEST_DAYS}) AS "expiresAt"`;
  await tx`INSERT INTO deletion_approvals (household_id, membership_id) VALUES (${ctx.household.id}, ${ctx.membership.id})`;
  const deleteAfter = await settle(tx);
  return deleteAfter ? { kind: "marked", deleteAfter } : { kind: "requested", expiresAt };
}

function assertVoter(ctx: Ctx): void {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  if (!ctx.membership.joinedAt) throw new ActionError("Only members who have joined vote on deleting the household.");
}

/** A joined member approves. Returns when it goes if theirs was the last approval, else null. */
export async function approveDeletion(tx: Tx, ctx: Ctx): Promise<Date | null> {
  assertVoter(ctx);
  const row = await lock(tx);
  if (!row.active) throw new ActionError(`There's no open request to delete ${ctx.household.name}.`);
  await tx`
    INSERT INTO deletion_approvals (household_id, membership_id) VALUES (${ctx.household.id}, ${ctx.membership.id})
    ON CONFLICT DO NOTHING`;
  return settle(tx);
}

/** Any joined member ends the request, whether or not they approved it. */
export async function cancelDeletion(tx: Tx, ctx: Ctx): Promise<void> {
  assertVoter(ctx);
  const row = await lock(tx);
  if (!row.active) throw new ActionError(`There's no open request to delete ${ctx.household.name}.`);
  await clearRequest(tx);
}

/**
 * Any admin takes a marked household back, until the day it goes: once that has passed the cron
 * may already be deleting its files, so it's too late. Skips readOnlyReason on purpose.
 */
export async function undoDeletion(tx: Tx, ctx: Ctx): Promise<void> {
  if (ctx.demo) throw new ActionError(DEMO_REFUSAL);
  if (ctx.membership.role !== "admin") throw new ActionError("Only a household admin can undo deleting it.");
  const row = await lock(tx);
  if (!row.deleteAfter) throw new ActionError(`${ctx.household.name} isn't being deleted.`);
  if (row.due) throw new ActionError(`It's too late to undo: ${ctx.household.name} is being deleted now.`);
  await tx`UPDATE households SET delete_after = NULL WHERE id = app_household_id()`;
}

// ---------------------------------------------------------------------------------------------
// Removing a membership: an admin removing someone, or someone leaving

export interface Removed {
  /** Bill types they owned, now ownerless. */
  owned: number;
  /** Unpaid bills still owed to them, shown as "former member". */
  openBills: number;
  /** The removal completed a deletion vote: when the household goes. */
  marked: Date | null;
}

/**
 * Deletes a membership. Their debt rows and queued thanks cascade away (a bill where they were
 * the last one owing becomes paid); bill types they owned, bills they posted and documents they
 * uploaded stay with no owner/poster/uploader. Then settles a deletion vote they were holding up.
 */
export async function removeMembership(tx: Tx, membershipId: number): Promise<Removed> {
  const [{ owned, openBills }] = await tx<{ owned: number; openBills: number }[]>`
    SELECT (SELECT count(*) FROM bill_types WHERE owner_id = ${membershipId}) AS owned,
           (SELECT count(*) FROM bills WHERE owner_id = ${membershipId} AND status = 'unpaid') AS "openBills"`;
  const billIds = (await tx<{ id: number }[]>`SELECT bill_id AS id FROM bill_debts WHERE person_id = ${membershipId}`).map((r) => r.id);
  await tx`DELETE FROM memberships WHERE id = ${membershipId}`;
  await refreshBillStatus(tx, billIds);
  return { owned, openBills, marked: await settle(tx) };
}

/** What leaving would wipe: what you still owe, and what's still owed to you. */
export async function leaveSummary(tx: Tx, membershipId: number): Promise<{ owe: number; owed: number }> {
  const [row] = await tx<{ owe: number; owed: number }[]>`
    SELECT coalesce((SELECT sum(b.per_person_cost) FROM bill_debts d JOIN bills b ON b.id = d.bill_id
                     WHERE d.person_id = ${membershipId} AND d.paid_at IS NULL), 0) AS owe,
           coalesce((SELECT sum(b.per_person_cost) FROM bill_debts d JOIN bills b ON b.id = d.bill_id
                     WHERE b.owner_id = ${membershipId} AND d.paid_at IS NULL), 0) AS owed`;
  return row;
}

export const LAST_ADMIN = (household: string) =>
  `You're the last admin of ${household}. Make someone else an admin first, or delete the household.`;

/** Leaves the household. Anyone but its last joined admin; never while it's read-only. */
export async function leaveHousehold(tx: Tx, ctx: Ctx): Promise<Removed> {
  assertWritable(ctx);
  if (ctx.membership.role === "admin") {
    // Lock the admin rows, as a demotion does, so two admins can't both leave the last seat.
    const others = await tx<{ id: number }[]>`
      SELECT id FROM memberships
      WHERE household_id = app_household_id() AND role = 'admin' AND joined_at IS NOT NULL AND id <> ${ctx.membership.id}
      FOR UPDATE`;
    if (others.length === 0) throw new ActionError(LAST_ADMIN(ctx.household.name));
  }
  return removeMembership(tx, ctx.membership.id);
}

// ---------------------------------------------------------------------------------------------
// The cron's part

/** A request past REQUEST_DAYS is cleared (compare-and-set). True when this call cleared one. */
export async function expireRequest(scope: TenantScope): Promise<boolean> {
  return withHousehold(scope, async (tx) => {
    const rows = await tx`
      UPDATE households SET deletion_requested_at = NULL, deletion_requested_by = NULL
      WHERE id = app_household_id() AND deletion_requested_at <= now() - make_interval(days => ${REQUEST_DAYS})
      RETURNING id`;
    if (rows.length) await tx`DELETE FROM deletion_approvals WHERE household_id = app_household_id()`;
    return rows.length > 0;
  });
}

/**
 * Deletes a marked household whose day has come: its Blob prefix first, then the row (every
 * table cascades; the cascade runs as the table owner, so no owner connection is needed). A
 * crash between the two leaves the row, and the next tick finishes the job. Undo is refused once
 * the day has passed, so nothing can take it back mid-way. True when the row went.
 */
export async function hardDelete(householdId: number): Promise<boolean> {
  const scope: TenantScope = { household: { id: householdId }, user: null };
  const due = await withHousehold(scope, (tx) => tx`SELECT 1 FROM households WHERE id = app_household_id() AND delete_after <= now()`);
  if (due.length === 0) return false;
  await deletePrefix(householdPrefix(householdId));
  const gone = await withHousehold(scope, (tx) => tx`DELETE FROM households WHERE id = app_household_id() AND delete_after <= now()`);
  return gone.count > 0;
}

/**
 * The operator's immediate delete (/admin): marks the household due now, then runs the same
 * hardDelete the cron would, so the Blob prefix and the row go the one way there is. No grace,
 * no vote, no mail. True when the row went; false when it was already gone.
 */
export async function deleteNow(householdId: number): Promise<boolean> {
  const scope: TenantScope = { household: { id: householdId }, user: null };
  const marked = await withHousehold(scope, (tx) => tx`UPDATE households SET delete_after = now() WHERE id = app_household_id()`);
  if (marked.count === 0) return false;
  return hardDelete(householdId);
}

// ---------------------------------------------------------------------------------------------
// Mail

export interface DeletionMail {
  event: DeletionEvent;
  /** Who did it, or null (a lapse, a vote completed by someone leaving). They aren't emailed about their own act, except the "marked" confirmation. */
  actor: { membershipId: number; name: string } | null;
  expiresAt?: Date;
  deleteAfter?: Date;
}

/** Tells the joined members, right after the change commits. Never deferred for the budget. */
export async function sendDeletionMail(
  scope: TenantScope & { household: Household },
  m: DeletionMail,
  opts: { mailer?: Mailer } = {},
): Promise<{ sent: number; failed: number }> {
  const mail = opts.mailer ?? defaultMailer;
  const skip = m.event === "marked" ? -1 : (m.actor?.membershipId ?? -1);
  const recipients = await withHousehold(scope, (tx) => tx<{ name: string; email: string }[]>`
    SELECT u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.household_id = app_household_id() AND m.joined_at IS NOT NULL AND m.id <> ${skip}
    ORDER BY u.name`);
  if (recipients.length === 0) return { sent: 0, failed: 0 };
  const h = scope.household;
  const props = {
    theme: h.theme,
    event: m.event,
    householdName: h.name,
    householdSlug: h.slug,
    actorName: m.actor?.name ?? null,
    expiresOn: m.expiresAt ? householdDate(scope, m.expiresAt) : undefined,
    deleteOn: m.deleteAfter ? householdDate(scope, m.deleteAfter) : undefined,
  };
  const oks = await mail.sendBatch(
    scope,
    recipients.map((r) => ({
      to: r.email,
      subject: deletionSubject(props),
      react: createElement(HouseholdDeletion, { ...props, recipientName: r.name }),
      kind: "household_deletion" as const,
    })),
  );
  const sent = oks.filter(Boolean).length;
  return { sent, failed: oks.length - sent };
}
