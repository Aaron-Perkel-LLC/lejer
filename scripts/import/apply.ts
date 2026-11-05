// Writes a Plan into Postgres as the table owner, inside the caller's transaction, and says
// which blobs then need copying. Used by the one-time import of the legacy households (since
// removed) and by scripts/verify/import.ts (a fixture household on dev, rolled back).
//
// It refuses rather than adapts: a slug that exists or is reserved, or an operator's address
// among the members (an operator account is never a member, CLAUDE.md), ends the run before
// a row is written.

import { refreshBillStatus } from "@/lib/bills";
import { billPdfKey, documentsPrefix } from "@/lib/blob";
import type { Tx } from "@/lib/db";
import { isReservedSlug } from "@/lib/paths";
import { superadminEmails } from "@/lib/superadmin";
import type { Plan } from "./transform";

export interface BlobCopy {
  source: string; // key in the legacy app's store
  dest: string; // key in this environment's store
  contentType: string;
}
export interface Applied {
  householdId: number;
  membershipIds: Map<number, number>; // source person id → memberships.id
  typeIds: Map<number, number>;
  billIds: Map<number, number>;
  usersCreated: number;
  usersReused: number;
  copies: BlobCopy[];
}

export async function applyPlan(tx: Tx, plan: Plan): Promise<Applied> {
  const h = plan.household;
  if (isReservedSlug(h.slug)) throw new Error(`"${h.slug}" is a reserved slug`);
  const [taken] = await tx<{ id: number }[]>`SELECT id FROM households WHERE slug = ${h.slug}`;
  if (taken) throw new Error(`slug "${h.slug}" is already household ${taken.id}; remove or rename it first (the import never takes "-2")`);
  const operators = superadminEmails();
  for (const u of plan.users) if (operators.has(u.email)) throw new Error(`${u.email} runs the site (SUPERADMIN_EMAILS) and can't be a member`);

  // Users: keep an existing row's name; the legacy name only applies to a new one.
  const userIds = new Map<string, number>();
  let usersCreated = 0;
  for (const u of plan.users) {
    const [row] = await tx<{ id: number; inserted: boolean }[]>`
      INSERT INTO users (email, name) VALUES (${u.email}, ${u.name})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, (xmax = 0) AS inserted`;
    userIds.set(u.email, row.id);
    if (row.inserted) usersCreated++;
  }

  const [{ id: householdId }] = await tx<{ id: number }[]>`
    INSERT INTO households (
      slug, name, tagline, mode, theme, color_scheme, timezone, ask_bill_date,
      feature_rent, feature_trends, feature_bulk_email, feature_documents, feature_welcome_tour, feature_thanks,
      monthly_rent, lease_start, lease_end,
      reminders_enabled, send_hour, first_reminder_days, urgent_reminder_days,
      last_run_at, last_send_date, last_sent_at, last_sent_count, reply_to
    ) VALUES (
      ${h.slug}, ${h.name}, ${h.tagline}, ${h.mode}, ${h.theme}, ${h.colorScheme}, ${h.timezone}, ${h.askBillDate},
      ${h.featureRent}, ${h.featureTrends}, ${h.featureBulkEmail}, ${h.featureDocuments}, ${h.featureWelcomeTour}, ${h.featureThanks},
      ${h.monthlyRent}, ${h.leaseStart}, ${h.leaseEnd},
      ${h.remindersEnabled}, ${h.sendHour}, ${h.firstReminderDays}, ${h.urgentReminderDays},
      ${h.lastRunAt}, ${h.lastSendDate}, ${h.lastSentAt}, ${h.lastSentCount}, ${h.replyTo}
    ) RETURNING id`;

  // Members arrive joined: their addresses were proven on the old site, and reminders go only
  // to joined members, so a pending invite would silence them.
  const membershipIds = new Map<number, number>();
  for (const m of plan.members) {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO memberships (household_id, user_id, role, splits_bills, welcomed_at, joined_at)
      VALUES (${householdId}, ${userIds.get(m.email)!}, ${m.role}, ${m.splitsBills}, ${m.welcomedAt}, now())
      RETURNING id`;
    membershipIds.set(m.key, row.id);
  }
  const member = (key: number | null) => (key === null ? null : membershipIds.get(key)!);

  const typeIds = new Map<number, number>();
  for (const t of plan.types) {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO bill_types (household_id, name, emoji, processing_fee, owner_id)
      VALUES (${householdId}, ${t.name}, ${t.emoji}, ${t.processingFee}, ${member(t.ownerKey)})
      RETURNING id`;
    typeIds.set(t.key, row.id);
  }
  const typeName = new Map(plan.types.map((t) => [t.key, t.name]));

  const billIds = new Map<number, number>();
  const copies: BlobCopy[] = [];
  for (const b of plan.bills) {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO bills (
        household_id, type_id, bill_date, due_date, total, per_person_cost, status, added_by_id,
        owner_id, had_owner, fee, shares, owner_share, notice_kind, notice_queued_at, notified_at
      ) VALUES (
        ${householdId}, ${typeIds.get(b.typeKey)!}, ${b.billDate}, ${b.dueDate}, ${b.total}, ${b.perPersonCost}, ${b.status}, ${member(b.addedByKey)},
        ${member(b.ownerKey)}, ${b.ownerKey !== null}, ${b.fee}, ${b.shares}, ${b.ownerShare}, NULL, NULL, now()
      ) RETURNING id`;
    billIds.set(b.key, row.id);
    if (b.debts.length) {
      const rows = b.debts.map((d) => ({ household_id: householdId, bill_id: row.id, person_id: member(d.personKey)!, paid_at: d.paidAt }));
      await tx`INSERT INTO bill_debts ${tx(rows, "household_id", "bill_id", "person_id", "paid_at")}`;
    }
    if (b.sourcePdf) {
      const dest = billPdfKey(householdId, typeName.get(b.typeKey)!, b.billDate, row.id);
      await tx`UPDATE bills SET pdf_path = ${dest} WHERE id = ${row.id}`;
      copies.push({ source: b.sourcePdf, dest, contentType: "application/pdf" });
    }
  }

  for (const d of plan.documents) {
    const dest = `${documentsPrefix(householdId)}${d.fileName}`;
    await tx`
      INSERT INTO documents (household_id, title, category, file_path, content_type, file_size, uploaded_at, uploaded_by)
      VALUES (${householdId}, ${d.title}, ${d.category}, ${dest}, ${d.contentType}, ${d.fileSize}, ${d.uploadedAt}, ${member(d.uploadedByKey)})`;
    copies.push({ source: d.sourcePath, dest, contentType: d.contentType });
  }

  // The status was computed in the plan; re-deriving it from the rows is the check that the
  // rows say the same thing.
  const statuses = await refreshBillStatus(tx, [...billIds.values()]);
  for (const b of plan.bills) {
    const got = statuses.get(billIds.get(b.key)!);
    if (got !== b.status) throw new Error(`bill ${b.key}: rows say ${got}, plan said ${b.status}`);
  }

  return { householdId, membershipIds, typeIds, billIds, usersCreated, usersReused: plan.users.length - usersCreated, copies };
}

export interface Mismatch {
  what: string;
  expected: unknown;
  got: unknown;
}

/** Counts the household back out of the database and compares them with the plan. */
export async function verifyApplied(tx: Tx, plan: Plan, applied: Applied): Promise<Mismatch[]> {
  const hid = applied.householdId;
  const [c] = await tx<{ members: number; types: number; bills: number; total: number; unpaidBills: number; unpaid: number; paid: number; docs: number; withPdf: number; queued: number }[]>`
    SELECT
      (SELECT count(*) FROM memberships WHERE household_id = ${hid} AND joined_at IS NOT NULL) AS members,
      (SELECT count(*) FROM bill_types WHERE household_id = ${hid}) AS types,
      (SELECT count(*) FROM bills WHERE household_id = ${hid}) AS bills,
      (SELECT coalesce(sum(total), 0) FROM bills WHERE household_id = ${hid}) AS total,
      (SELECT count(*) FROM bills WHERE household_id = ${hid} AND status = 'unpaid') AS "unpaidBills",
      (SELECT count(*) FROM bill_debts WHERE household_id = ${hid} AND paid_at IS NULL) AS unpaid,
      (SELECT count(*) FROM bill_debts WHERE household_id = ${hid} AND paid_at IS NOT NULL) AS paid,
      (SELECT count(*) FROM documents WHERE household_id = ${hid}) AS docs,
      (SELECT count(*) FROM bills WHERE household_id = ${hid} AND pdf_path IS NOT NULL) AS "withPdf",
      (SELECT count(*) FROM bills WHERE household_id = ${hid} AND notice_kind IS NOT NULL) AS queued`;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const expect = {
    members: plan.members.length,
    types: plan.types.length,
    bills: plan.bills.length,
    total: round2(plan.bills.reduce((s, b) => s + b.total, 0)),
    unpaidBills: plan.bills.filter((b) => b.status === "unpaid").length,
    unpaid: plan.stats.debtsCopied,
    paid: plan.stats.debtsSynthesized,
    docs: plan.documents.length,
    withPdf: plan.bills.filter((b) => b.sourcePdf).length,
    queued: 0,
  };
  const out: Mismatch[] = [];
  for (const k of Object.keys(expect) as (keyof typeof expect)[]) {
    const got = k === "total" ? round2(c[k]) : c[k];
    if (got !== expect[k]) out.push({ what: k, expected: expect[k], got });
  }
  return out;
}
