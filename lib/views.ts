import {
  type Bill,
  type BillType,
  type Debt,
  type OpenBill,
  type OwedPair,
  type Person,
  countBills,
  getBillTypes,
  getBillsPage,
  getDebtsForPage,
  getOpenBills,
  getMyBalance,
  getMembers,
  getOwedPairs,
  getPayer,
  getSplitters,
} from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { type Tx, withHousehold } from "@/lib/db";
import { type BulkRecipient, bulkRecipients } from "@/lib/bulk";
import { DEMO_BILLS, DEMO_BILL_TYPES, DEMO_PEOPLE, DEMO_SPLITTERS, DEMO_VIEWER, demoDebts, demoMonthTotals } from "@/lib/demo";
import { leaveSummary } from "@/lib/deletion";
import { type ExportRow, billsCsv, exportRows } from "@/lib/export";
import { getCurrentHousehold } from "@/lib/households";
import { BULK_DAILY_LIMIT, sendsToday } from "@/lib/mail";
import { localDate } from "@/lib/time";
import { type Trends, buildTrends, monthTotals, trendTypes, trendsCsv } from "@/lib/trends";
import type { ReminderRun } from "@/lib/types";

// One loader per page: a single withHousehold transaction for a real household, the in-memory
// data for the demo. Pages never branch on ctx.demo themselves.

export interface Paged {
  page: number;
  totalPages: number;
  totalBills: number;
  bills: Bill[];
}

function paginate<T extends { billDate: string; id: number }>(all: T[], page: number, perPage: number) {
  const sorted = [...all].sort((a, b) => b.billDate.localeCompare(a.billDate) || b.id - a.id);
  return sorted.slice((page - 1) * perPage, page * perPage);
}

function pageInfo(totalBills: number, perPage: number, requested: number) {
  const totalPages = Math.max(1, Math.ceil(totalBills / perPage));
  return { totalPages, page: Math.min(Math.max(1, requested), totalPages) };
}

/**
 * A page is fetched at the requested offset without waiting for the count (the page redirects
 * to the clamped page when they disagree), so cap what ?page= can ask for before it becomes an
 * OFFSET Postgres can't parse.
 */
const MAX_PAGE = 100_000;
const pageOffset = (requested: number, perPage: number) => (Math.min(Math.max(1, requested), MAX_PAGE) - 1) * perPage;

function demoPairs(): OwedPair[] {
  const pairs = new Map<string, OwedPair>();
  for (const b of DEMO_BILLS) {
    for (const d of demoDebts(b.id)) {
      if (d.paid) continue;
      const key = `${d.personId}->${b.ownerId}`;
      const p = pairs.get(key) ?? { debtorId: d.personId, debtor: d.name, ownerId: b.ownerId, owner: b.ownerName, amount: 0 };
      p.amount = Math.round((p.amount + b.perPersonCost) * 100) / 100;
      pairs.set(key, p);
    }
  }
  return [...pairs.values()].sort((a, b) => a.debtor.localeCompare(b.debtor) || (a.owner ?? "").localeCompare(b.owner ?? ""));
}

export interface Dashboard {
  totalBills: number;
  /** What the viewer is owed on (bills they own, unpaid) and still owes, soonest due first. */
  open: OpenBill[];
  /** Every bill type and how many split, for the header's "+ Add bill" (filtered on the page). */
  types: BillType[];
  splitterCount: number;
  /** Everyone in the household, pending invites included: 1 means nobody's been invited yet. */
  memberCount: number;
  owed: { amount: number; billIds: number[]; nextDue: { dueDate: string; typeName: string } | null };
  pairs: OwedPair[];
  /** The household's today (YYYY-MM-DD), for due chips and "days late". */
  today: string;
  /** The soonest-due bill the viewer is owed on, and who hasn't paid it: the payer's "next due". */
  collect: { dueDate: string; typeName: string; debtors: string[] } | null;
  /** The viewer owns at least one bill type (in single_payer mode: the viewer is the payer). */
  ownsTypes: boolean;
  /** The viewer's own calendar feed token (never anyone else's); null in the demo. */
  calendarToken: string | null;
}

export async function loadDashboard(ctx: Ctx): Promise<Dashboard> {
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) {
    const me = ctx.membership.id;
    const mine = DEMO_BILLS.filter((b) => demoDebts(b.id).some((d) => d.personId === me && !d.paid));
    const next = [...mine].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const open = DEMO_BILLS.filter((b) => (b.ownerId === me && b.status === "unpaid") || mine.includes(b))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
      .map((b) => ({ ...b, debts: demoDebts(b.id) }));
    return {
      totalBills: DEMO_BILLS.length, open, types: DEMO_BILL_TYPES, splitterCount: DEMO_SPLITTERS.length,
      memberCount: DEMO_SPLITTERS.length,
      owed: {
        amount: Math.round(mine.reduce((s, b) => s + b.perPersonCost * 100, 0)) / 100,
        billIds: mine.map((b) => b.id),
        nextDue: next ? { dueDate: next.dueDate, typeName: next.typeName } : null,
      },
      pairs: demoPairs(),
      today,
      collect: (() => {
        const owed = DEMO_BILLS.filter((b) => b.ownerId === ctx.membership.id)
          .map((b) => ({ b, debtors: demoDebts(b.id).filter((d) => !d.paid).map((d) => d.name) }))
          .filter((x) => x.debtors.length > 0)
          .sort((x, y) => x.b.dueDate.localeCompare(y.b.dueDate))[0];
        return owed ? { dueDate: owed.b.dueDate, typeName: owed.b.typeName, debtors: owed.debtors } : null;
      })(),
      ownsTypes: DEMO_BILL_TYPES.some((t) => t.ownerId === ctx.membership.id),
      calendarToken: null,
    };
  }
  // One transaction, every read issued at once (postgres.js sends them in order on the
  // transaction's connection): nothing here depends on another read.
  return withHousehold(ctx, async (tx) => {
    const [totalBills, open, viewer, owed, pairs, collect] = await Promise.all([
      countBills(tx),
      getOpenBills(tx, ctx.membership.id),
      viewerRow(tx, ctx.membership.id),
      getMyBalance(tx, ctx.membership.id),
      getOwedPairs(tx),
      nextToCollect(tx, ctx.membership.id),
    ]);
    return {
      totalBills, open, types: viewer.types, splitterCount: viewer.splitters, memberCount: viewer.members, owed, pairs, today, collect,
      ownsTypes: viewer.types.some((t) => t.ownerId === ctx.membership.id), calendarToken: viewer.token,
    };
  });
}

export interface BillsView extends Paged {
  /** The household's today (YYYY-MM-DD). */
  today: string;
  types: BillType[];
  splitters: Person[];
  debts: Record<number, Debt[]>;
}

export async function loadBills(ctx: Ctx, requestedPage: number): Promise<BillsView> {
  const perPage = ctx.household.billsPerPage;
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) {
    const { page, totalPages } = pageInfo(DEMO_BILLS.length, perPage, requestedPage);
    const bills = paginate(DEMO_BILLS, page, perPage);
    return {
      page, totalPages, totalBills: DEMO_BILLS.length, bills, today,
      types: DEMO_BILL_TYPES, splitters: DEMO_SPLITTERS,
      debts: Object.fromEntries(bills.map((b) => [b.id, demoDebts(b.id)])),
    };
  }
  return withHousehold(ctx, async (tx) => {
    const offset = pageOffset(requestedPage, perPage);
    const [totalBills, bills, debts, types, splitters] = await Promise.all([
      countBills(tx),
      getBillsPage(tx, perPage, offset),
      getDebtsForPage(tx, perPage, offset),
      getBillTypes(tx),
      getSplitters(tx),
    ]);
    const { page, totalPages } = pageInfo(totalBills, perPage, requestedPage);
    return { page, totalPages, totalBills, bills, today, types, splitters, debts: Object.fromEntries(debts) };
  });
}

export interface SettingsView {
  /** The cron's bookkeeping for the readout (the settings themselves are on ctx). */
  run: ReminderRun;
  /** Everyone who could be the single payer (and own a utility). */
  members: Person[];
  /** The current payer (the owner the types share), or the first joined admin. */
  payerId: number | null;
  /** The Utilities group: every bill type and its owner. */
  types: BillType[];
  /** For "Leave or delete": who has joined, whether the viewer is the last joined admin, and what leaving would wipe. */
  joined: number;
  lastAdmin: boolean;
  balance: { owe: number; owed: number };
}

/** /{slug}/household/settings. */
export async function loadSettings(ctx: Ctx): Promise<SettingsView> {
  if (ctx.demo) {
    return {
      run: { lastRunAt: null, lastSendDate: null, lastSentAt: null, lastSentCount: 0 },
      members: DEMO_PEOPLE.map(({ id, name }) => ({ id, name })),
      payerId: DEMO_VIEWER.id,
      types: DEMO_BILL_TYPES,
      joined: DEMO_PEOPLE.length,
      lastAdmin: false,
      balance: { owe: 0, owed: 0 },
    };
  }
  return withHousehold(ctx, async (tx) => {
    const [h, members, payerId, types, roster, balance] = await Promise.all([
      getCurrentHousehold(tx),
      getMembers(tx),
      getPayer(tx),
      getBillTypes(tx),
      tx<{ joined: number; otherAdmins: number }[]>`
        SELECT count(*) FILTER (WHERE joined_at IS NOT NULL) AS joined,
               count(*) FILTER (WHERE joined_at IS NOT NULL AND role = 'admin' AND id <> ${ctx.membership.id}) AS "otherAdmins"
        FROM memberships WHERE household_id = app_household_id()`,
      leaveSummary(tx, ctx.membership.id),
    ]);
    return {
      run: { lastRunAt: h?.lastRunAt ?? null, lastSendDate: h?.lastSendDate ?? null, lastSentAt: h?.lastSentAt ?? null, lastSentCount: h?.lastSentCount ?? 0 },
      members,
      payerId,
      types,
      joined: roster[0].joined,
      lastAdmin: ctx.membership.role === "admin" && roster[0].otherAdmins === 0,
      balance,
    };
  });
}

export interface BulkEmailView {
  joined: BulkRecipient[];
  pending: string[];
  /** Joined members who turned admins' notes off (lib/unsubscribe.ts). */
  muted: string[];
  /** Whether a send right now fits under the bulk ceiling (no counts are shown: they're account-wide). */
  fits: boolean;
}

/** /{slug}/household/email: who a note would reach, and whether today's allowance has room for it. */
export async function loadBulkEmail(ctx: Ctx): Promise<BulkEmailView> {
  if (ctx.demo) return { joined: DEMO_PEOPLE.map((p, i) => ({ membershipId: i + 1, name: p.name, email: p.email })), pending: [], muted: [], fits: true };
  return withHousehold(ctx, async (tx) => {
    const [{ joined, pending, muted }, used] = await Promise.all([bulkRecipients(tx), sendsToday(tx)]);
    return { joined, pending, muted, fits: used + joined.length + (ctx.household.digestEmail ? 1 : 0) <= BULK_DAILY_LIMIT };
  });
}

/** /trends: monthly totals per type through this month, in the household's calendar. */
export async function loadTrends(ctx: Ctx): Promise<Trends> {
  const today = localDate(ctx.household.timezone);
  if (ctx.demo) return buildTrends(demoMonthTotals(today), DEMO_BILL_TYPES, today);
  return withHousehold(ctx, async (tx) => {
    const [totals, types] = await Promise.all([monthTotals(tx), trendTypes(tx)]);
    return buildTrends(totals, types, today);
  });
}

/** /trends/csv: the whole history, every type its own column. */
export async function loadTrendsCsv(ctx: Ctx): Promise<string> {
  if (ctx.demo) return trendsCsv(demoMonthTotals(localDate(ctx.household.timezone)), DEMO_BILL_TYPES);
  return withHousehold(ctx, async (tx) => {
    const [totals, types] = await Promise.all([monthTotals(tx), trendTypes(tx)]);
    return trendsCsv(totals, types);
  });
}

/** /household/export: every bill and payment, one row per share. */
export async function loadExportCsv(ctx: Ctx): Promise<string> {
  if (ctx.demo) {
    const rows = DEMO_BILLS.flatMap((b): ExportRow[] => {
      const base = { billId: b.id, typeName: b.typeName, billDate: b.billDate, dueDate: b.dueDate, total: b.total, perPersonCost: b.perPersonCost, status: b.status, owner: b.ownerName };
      const debts = demoDebts(b.id);
      return debts.length
        ? debts.map((d) => ({ ...base, debtor: d.name, paidAt: d.paid ? new Date(`${b.dueDate}T12:00:00Z`) : null }))
        : [{ ...base, debtor: null, paidAt: null }];
    });
    return billsCsv(rows, ctx.household.timezone);
  }
  return withHousehold(ctx, async (tx) => billsCsv(await exportRows(tx), ctx.household.timezone));
}

/** The soonest-due bill owed to `membershipId` that someone still owes on, with their names. */
async function nextToCollect(tx: Tx, membershipId: number): Promise<Dashboard["collect"]> {
  const [row] = await tx<{ dueDate: string; typeName: string; debtors: string[] }[]>`
    SELECT b.due_date AS "dueDate", t.name AS "typeName", array_agg(u.name ORDER BY u.name) AS debtors
    FROM bills b
    JOIN bill_types t ON t.id = b.type_id
    JOIN bill_debts d ON d.bill_id = b.id AND d.paid_at IS NULL
    JOIN memberships m ON m.id = d.person_id
    JOIN users u ON u.id = m.user_id
    WHERE b.owner_id = ${membershipId}
    GROUP BY b.id, b.due_date, t.name
    ORDER BY b.due_date, b.id LIMIT 1`;
  return row ?? null;
}

/**
 * What the overview needs about posting and the viewer, in one statement: the household's bill
 * types (whether the viewer owns one, and what the header's "+ Add bill" offers), how many split
 * bills and how many belong at all, and the viewer's own calendar token (never anyone else's).
 */
async function viewerRow(tx: Tx, membershipId: number): Promise<{ types: BillType[]; splitters: number; members: number; token: string }> {
  const [row] = await tx<{ types: BillType[]; splitters: number; members: number; token: string }[]>`
    SELECT coalesce((
             SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'emoji', t.emoji, 'processingFee', t.processing_fee,
                                               'ownerId', t.owner_id, 'ownerName', u.name) ORDER BY t.name)
             FROM bill_types t LEFT JOIN memberships m ON m.id = t.owner_id LEFT JOIN users u ON u.id = m.user_id), '[]') AS types,
           (SELECT count(*) FROM memberships WHERE household_id = app_household_id() AND splits_bills) AS splitters,
           (SELECT count(*) FROM memberships WHERE household_id = app_household_id()) AS members,
           (SELECT calendar_token FROM memberships WHERE id = ${membershipId}) AS token`;
  return row;
}

/** /welcome: the household's bill types and who fronts each (the tour's first scene). */
export async function loadTour(ctx: Ctx): Promise<{ emoji: string | null; type: string; owner: string | null }[]> {
  const types = ctx.demo ? DEMO_BILL_TYPES : await withHousehold(ctx, (tx) => getBillTypes(tx));
  return types.slice(0, 4).map((t) => ({ emoji: t.emoji, type: t.name, owner: t.ownerName }));
}
