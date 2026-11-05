// What /admin shows and does: the operator's view, read through the admin_* definer functions
// (0011, 0013) in one withUser transaction, and the two operator writes, deleting a user and
// deleting a household (ARCHITECTURE.md §4 "Cross-household reads for the operator"); the
// operator's email is lib/operator-mail.ts, on the same reads. Metadata, counts, names and
// addresses, the month's and today's sends against the ceilings (lib/mail-limits.ts), the last
// eight weeks of sign-ups and bills, and the waitlist with who has been told (0018); the
// functions return no amounts, hashes, file paths or tokens, so the page can't either. The
// writes reuse the household library under a system scope, so there is no new owner-connection
// call site.

import { type TenantScope, type Tx, withHousehold, withUser } from "@/lib/db";
import { deleteNow, removeMembership } from "@/lib/deletion";
import { ActionError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/login-codes";
import { EMAIL_DAILY_CEILING, RESEND_MONTHLY_QUOTA } from "@/lib/mail-limits";
import { superadminEmails } from "@/lib/superadmin";
import type { User } from "@/lib/types";

export interface AdminHousehold {
  id: number;
  name: string;
  slug: string;
  mode: string;
  theme: string;
  createdAt: Date;
  memberCount: number;
  joinedCount: number;
  billCount: number;
  lastActivity: Date;
  deletionRequestedAt: Date | null;
  deleteAfter: Date | null;
  remindersEnabled: boolean;
  lastRunAt: Date | null;
  lastSendDate: string | null;
  lastSentAt: Date | null;
  lastSentCount: number;
  lastTickOutcome: string | null;
}

export interface AdminTotals {
  households: number;
  users: number;
  membershipsJoined: number;
  membershipsPending: number;
  bills: number;
  billsUnpaid: number;
  householdsDeleting: number;
}

export interface AdminEmailKind {
  kind: string;
  sent: number;
  failed: number;
}

export interface AdminEmailFailure {
  sentAt: Date;
  kind: string;
  householdName: string | null;
}

/** One ISO week (UTC), from admin_weekly(): what was created in it. */
export interface AdminWeek {
  /** The Monday, as YYYY-MM-DD. */
  week: string;
  households: number;
  users: number;
  bills: number;
}

export interface AdminMembership {
  membershipId: number;
  householdId: number;
  householdName: string;
  slug: string;
  role: "admin" | "member";
  /** ISO string from json; null while the invite is pending. */
  joinedAt: string | null;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  createdAt: Date;
  memberships: AdminMembership[];
  /** In SUPERADMIN_EMAILS: shown as such, never deletable from the page. */
  operator: boolean;
  /** Turned the operator's updates off (users.muted_kinds, 0016): the compose form skips them. */
  mutedUpdates: boolean;
}

/** One person's seat in a household, for the households list. */
export interface AdminMember {
  userId: number;
  name: string;
  email: string;
  role: "admin" | "member";
  joined: boolean;
}

export interface AdminView {
  households: AdminHousehold[];
  /** Everyone in each household, by household id, from the users' membership json. */
  membersByHousehold: Map<number, AdminMember[]>;
  users: AdminUser[];
  totals: AdminTotals;
  /** Today's sends (UTC day) per kind. */
  today: AdminEmailKind[];
  /** Sends today and this UTC month (ok and failed alike), against the app's day ceiling and Resend's month quota. */
  budget: { today: number; month: number; dailyCeiling: number; monthQuota: number };
  failures: AdminEmailFailure[];
  /** The last WEEKS ISO weeks, oldest first, this week last. */
  weekly: AdminWeek[];
  /** The coming-soon page's sign-ups (0015), newest first, with when the launch note reached them (0018). Global, no RLS, read directly. */
  waitlist: { email: string; createdAt: Date; notifiedAt: Date | null }[];
  since: { day: Date; month: Date; failures: Date };
}

export const FAILURE_DAYS = 7;
export const FAILURE_ROWS = 20;
export const WEEKS = 8;

/** Every account with its address and memberships, through admin_users() (0013). */
export const selectUsers = (tx: Tx) =>
  tx<Omit<AdminUser, "operator" | "mutedUpdates">[]>`SELECT id, email, name, created_at AS "createdAt", memberships FROM admin_users()`;

/** Each account's own muted categories (users has no RLS; 0016). Joined in JS with selectUsers. */
export const selectUserMutes = (tx: Tx) => tx<{ id: number; muted: string[] }[]>`SELECT id, muted_kinds AS muted FROM users`;

const selectHouseholds = (tx: Tx) =>
  tx<AdminHousehold[]>`
    SELECT id, name, slug, mode, theme, created_at AS "createdAt", member_count AS "memberCount",
           joined_count AS "joinedCount", bill_count AS "billCount", last_activity AS "lastActivity",
           deletion_requested_at AS "deletionRequestedAt", delete_after AS "deleteAfter",
           reminders_enabled AS "remindersEnabled", last_run_at AS "lastRunAt", last_send_date AS "lastSendDate",
           last_sent_at AS "lastSentAt", last_sent_count AS "lastSentCount", last_tick_outcome AS "lastTickOutcome"
    FROM admin_households()`;

export async function loadAdmin(user: User, now = new Date()): Promise<AdminView> {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const failuresSince = new Date(now.getTime() - FAILURE_DAYS * 24 * 60 * 60 * 1000);
  const operators = superadminEmails();
  return withUser(user.id, async (tx: Tx) => {
    const [households, rawUsers, mutes, [totals], today, [{ monthSends }], failures, weekly, waitlist] = await Promise.all([
      selectHouseholds(tx),
      selectUsers(tx),
      selectUserMutes(tx),
      tx<AdminTotals[]>`
        SELECT households, users, memberships_joined AS "membershipsJoined", memberships_pending AS "membershipsPending",
               bills, bills_unpaid AS "billsUnpaid", households_deleting AS "householdsDeleting"
        FROM admin_totals()`,
      tx<AdminEmailKind[]>`SELECT kind, sent, failed FROM admin_email_kinds(${day})`,
      tx<{ monthSends: number }[]>`SELECT email_sends_since(${month}) AS "monthSends"`,
      tx<AdminEmailFailure[]>`
        SELECT sent_at AS "sentAt", kind, household_name AS "householdName"
        FROM admin_email_failures(${failuresSince}, ${FAILURE_ROWS})`,
      tx<AdminWeek[]>`SELECT week, households, users, bills FROM admin_weekly(${WEEKS})`,
      tx<AdminView["waitlist"]>`SELECT email, created_at AS "createdAt", notified_at AS "notifiedAt" FROM waitlist ORDER BY created_at DESC`,
    ]);
    const mutedUpdates = new Set(mutes.filter((m) => m.muted.includes("updates")).map((m) => m.id));
    const users = rawUsers.map((u) => ({ ...u, operator: operators.has(normalizeEmail(u.email) ?? ""), mutedUpdates: mutedUpdates.has(u.id) }));
    const membersByHousehold = new Map<number, AdminMember[]>();
    for (const u of users) {
      for (const m of u.memberships) {
        const list = membersByHousehold.get(m.householdId) ?? [];
        list.push({ userId: u.id, name: u.name, email: u.email, role: m.role, joined: m.joinedAt !== null });
        membersByHousehold.set(m.householdId, list);
      }
    }
    for (const list of membersByHousehold.values()) {
      list.sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.name.localeCompare(b.name));
    }
    const used = today.reduce((n, k) => n + k.sent + k.failed, 0);
    return {
      households,
      membersByHousehold,
      users,
      totals,
      today,
      budget: { today: used, month: monthSends, dailyCeiling: EMAIL_DAILY_CEILING, monthQuota: RESEND_MONTHLY_QUOTA },
      failures,
      weekly,
      waitlist,
      since: { day, month, failures: failuresSince },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The operator's writes. Both ask for the record's own key typed back (its email, its slug) so a
// stray click deletes nothing, and both refuse with an ActionError the page can show.

/**
 * Deletes a user: each membership goes the way an admin's removal does (removeMembership: their
 * debt rows drop, bills they fronted read "former member", a deletion vote they held up settles),
 * one withHousehold per household under the system scope, then the users row. A household they
 * were alone in stays, empty, for the operator to delete next. Never the operator, never an
 * address in SUPERADMIN_EMAILS.
 */
export async function deleteUserAsOperator(operator: User, userId: number, typedEmail: string): Promise<{ email: string; households: number }> {
  if (userId === operator.id) throw new ActionError("You can't delete your own account from here.");
  const user = await withUser(operator.id, async (tx) => (await selectUsers(tx)).find((u) => u.id === userId));
  if (!user) throw new ActionError("That account no longer exists.");
  const email = normalizeEmail(user.email) ?? user.email;
  if (superadminEmails().has(email)) throw new ActionError("That address runs the site. Take it out of SUPERADMIN_EMAILS first.");
  if (normalizeEmail(typedEmail) !== email) throw new ActionError(`Type the address exactly as shown (${user.email}) to delete that account.`);
  for (const m of user.memberships) {
    const scope: TenantScope = { household: { id: m.householdId }, user: null };
    await withHousehold(scope, (tx) => removeMembership(tx, m.membershipId));
  }
  const gone = await withUser(operator.id, (tx) => tx`DELETE FROM users WHERE id = ${userId}`);
  if (gone.count === 0) throw new ActionError("That account no longer exists.");
  return { email: user.email, households: user.memberships.length };
}

/**
 * Deletes a household right now: its Blob prefix, then the row (deleteNow → hardDelete, the
 * cron's path). No grace week, no vote, no mail; the members' accounts stay.
 */
export async function deleteHouseholdAsOperator(operator: User, householdId: number, typedSlug: string): Promise<AdminHousehold> {
  const household = await withUser(operator.id, async (tx) => (await selectHouseholds(tx)).find((h) => h.id === householdId));
  if (!household) throw new ActionError("That household no longer exists.");
  if (typedSlug.trim() !== household.slug) throw new ActionError(`Type the slug exactly as shown (${household.slug}) to delete ${household.name}.`);
  if (!(await deleteNow(householdId))) throw new ActionError("That household no longer exists.");
  return household;
}
