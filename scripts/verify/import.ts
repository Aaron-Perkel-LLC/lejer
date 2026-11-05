// The TiDB import (scripts/import/*, ARCHITECTURE.md §11): the pure transform over a hand-built
// legacy source, and the apply step into a fixture household on dev, rolled back. Never touches
// TiDB or Blob.

import { adminSql } from "@/lib/db";
import { applyPlan, verifyApplied } from "../import/apply";
import type { Source } from "../import/source";
import { type HouseSpec, localNoon, transform } from "../import/transform";
import { RUN, type Results, type Sql, email } from "./harness";

export async function importData(r: Results, _conns: { owner: Sql }) {
  const tz = "America/New_York";
  // A: pays everything (utilities) / owns Gas (peach-cob). B and C split. D signs in but never
  // splits (peach-cob's maintainer). Two people in the source spell the same address differently.
  const src: Source = {
    people: [
      { id: 1, name: "Alex", email: ` ${email("imp-a").toUpperCase()} `, isAdmin: true, splitsBills: true, welcomedAt: null },
      { id: 2, name: "Bo", email: email("imp-b"), isAdmin: false, splitsBills: true, welcomedAt: new Date("2026-07-14T12:00:00Z") },
      { id: 3, name: "Cy", email: email("imp-c"), isAdmin: true, splitsBills: true, welcomedAt: null },
      { id: 4, name: "Dee", email: email("imp-d"), isAdmin: true, splitsBills: false, welcomedAt: null },
    ],
    billTypes: [
      { id: 10, name: "Gas", emoji: "🔥", processingFee: 1.5, ownerId: 1 },
      { id: 11, name: "Water", emoji: "  ", processingFee: 0, ownerId: 2 },
      { id: 12, name: "Trash", emoji: "🗑️", processingFee: 0, ownerId: 99 }, // owner no longer exists
    ],
    bills: [
      // Split 3 ways; A (self) and B still owe, C paid: A dropped, B copied, C synthesized.
      { id: 100, typeId: 10, billDate: "2026-03-01", dueDate: "2026-03-20", total: 90, perPersonCost: 30, status: "unpaid", pdfPath: "2026/Gas/0301.pdf", addedById: 1 },
      // From when only two split; settled. B and C both synthesized; shares reads back as 2.
      { id: 101, typeId: 10, billDate: "2026-01-05", dueDate: "2026-01-25", total: 60, perPersonCost: 30, status: "paid", pdfPath: null, addedById: null },
      // Owned by B (ledger): A and C owe, nothing synthesized.
      { id: 102, typeId: 11, billDate: "2026-03-02", dueDate: "2026-03-22", total: 30, perPersonCost: 10, status: "unpaid", pdfPath: "2026/Water/0302.pdf", addedById: 2 },
      // Ownerless type: everyone owes the house, so nobody is dropped.
      { id: 103, typeId: 12, billDate: "2026-03-03", dueDate: "2026-03-23", total: 45, perPersonCost: 15, status: "unpaid", pdfPath: null, addedById: 7 },
    ],
    debts: [
      { billId: 100, personId: 1 },
      { billId: 100, personId: 2 },
      { billId: 102, personId: 1 },
      { billId: 102, personId: 3 },
      { billId: 103, personId: 1 },
      { billId: 103, personId: 2 },
      { billId: 103, personId: 3 },
    ],
    documents: [
      { id: 1, title: "Lease", category: "lease", filePath: "documents/lease-abc123.pdf", contentType: "application/pdf", fileSize: 1234, uploadedAt: new Date("2026-06-01T15:00:00Z"), uploadedById: 1 },
    ],
    rent: { monthlyRent: 2400, leaseStart: "2026-06-01", leaseEnd: "2027-05-31" },
    reminders: { enabled: true, sendHour: 10, firstReminderDays: 5, urgentReminderDays: 2, lastRunAt: new Date(), lastSendDate: "2026-10-13", lastSentAt: null, lastSentCount: 2 },
  };
  const ledger: HouseSpec = {
    slug: `verify-${RUN}-import`,
    name: "Verify Import",
    tagline: "1 Test St",
    mode: "ledger",
    theme: "peach",
    colorScheme: "light",
    askBillDate: false,
    timezone: tz,
    features: { rent: false, trends: false, bulkEmail: false, documents: false, welcomeTour: true, thanks: true },
  };
  const single: HouseSpec = { ...ledger, mode: "single_payer", theme: "statement", colorScheme: "system", askBillDate: true, payerEmail: email("imp-a") };

  // ---------------------------------------------------------------------------------------------
  r.section("import: noon in the household's zone");
  r.check("March (EDT) noon is 16:00Z", localNoon("2026-03-20", tz).toISOString() === "2026-03-20T16:00:00.000Z");
  r.check("January (EST) noon is 17:00Z", localNoon("2026-01-25", tz).toISOString() === "2026-01-25T17:00:00.000Z");
  r.check("Tokyo noon is 03:00Z", localNoon("2026-03-20", "Asia/Tokyo").toISOString() === "2026-03-20T03:00:00.000Z");

  // ---------------------------------------------------------------------------------------------
  r.section("import: the transform (ledger)");
  const plan = transform(src, ledger);
  r.check("emails normalized, one user per address", plan.users.length === 4 && plan.users[0].email === email("imp-a"), plan.users);
  r.check("roles and splits carried", plan.members.find((m) => m.key === 4)?.role === "admin" && plan.members.find((m) => m.key === 4)?.splitsBills === false);
  r.check("a blank emoji becomes NULL", plan.types.find((t) => t.key === 11)?.emoji === null);
  r.check("an owner who no longer exists becomes the house", plan.types.find((t) => t.key === 12)?.ownerKey === null);
  const b100 = plan.bills.find((b) => b.key === 100)!;
  const rows = (b: typeof b100) => b.debts.map((d) => `${d.personKey}:${d.paidAt ? "paid" : "owes"}${d.synthesized ? "*" : ""}`).sort();
  r.check("bill 100: A's self-debt dropped, B still owes, C synthesized paid at due-date noon",
    rows(b100).join(" ") === "2:owes 3:paid*" && b100.debts.find((d) => d.personKey === 3)?.paidAt?.toISOString() === "2026-03-20T16:00:00.000Z", rows(b100));
  r.check("bill 100: shares 3 with the owner's share, fee capped at the type's, unpaid", b100.shares === 3 && b100.ownerShare && b100.fee === 1.5 && b100.status === "unpaid");
  const b101 = plan.bills.find((b) => b.key === 101)!;
  r.check("bill 101: both splitters synthesized paid; shares read back as 2, so no owner share", rows(b101).join(" ") === "2:paid* 3:paid*" && b101.shares === 2 && !b101.ownerShare && b101.status === "paid");
  const b102 = plan.bills.find((b) => b.key === 102)!;
  r.check("bill 102 (B's): A and C owe, nothing synthesized, owner share", rows(b102).join(" ") === "1:owes 3:owes" && b102.ownerShare && b102.ownerKey === 2);
  const b103 = plan.bills.find((b) => b.key === 103)!;
  r.check("bill 103 (the house's): all three owe, no owner, unknown poster dropped", rows(b103).join(" ") === "1:owes 2:owes 3:owes" && b103.ownerKey === null && !b103.ownerShare && b103.addedByKey === null);
  r.check("D never splits, so D gets no row anywhere", plan.bills.every((b) => !b.debts.some((d) => d.personKey === 4)));
  r.check("stats add up", plan.stats.debtsCopied === 6 && plan.stats.debtsDropped === 1 && plan.stats.debtsSynthesized === 3 && plan.stats.billsFlipped === 0 && plan.stats.blobs === 3, plan.stats);
  r.check("the document keeps its basename", plan.documents[0].fileName === "lease-abc123.pdf");
  r.check("reminder schedule, last send date and rent carried", plan.household.sendHour === 10 && plan.household.lastSendDate === "2026-10-13" && plan.household.monthlyRent === 2400 && plan.household.leaseEnd === "2027-05-31");
  r.check("reply-to is the first admin", plan.household.replyTo === email("imp-a"));

  r.section("import: the transform (single payer)");
  const sp = transform(src, single);
  r.check("every type is the payer's, the ownerless one included", sp.types.every((t) => t.ownerKey === 1));
  const s102 = sp.bills.find((b) => b.key === 102)!;
  r.check("bill 102 now runs to A: A's row dropped, C owes, B synthesized", rows(s102).join(" ") === "2:paid* 3:owes");
  r.check("reply-to is the payer", sp.household.replyTo === email("imp-a"));
  await r.throws("single payer without a payer refuses", async () => transform(src, { ...single, payerEmail: "nobody@verify.invalid" }), /payerEmail/);
  await r.throws("a reserved slug refuses", async () => transform(src, { ...ledger, slug: "admin" }), /slug/);
  await r.throws("a debt row for an unknown person refuses", async () => transform({ ...src, debts: [...src.debts, { billId: 100, personId: 42 }] }, ledger), /unknown person/);

  // ---------------------------------------------------------------------------------------------
  r.section("import: apply into dev, rolled back");
  const marker = new Error("rollback");
  const prior = process.env.SUPERADMIN_EMAILS;
  try {
    await adminSql().begin(async (tx) => {
      // The address already exists (in a different spelling): the row and its name are kept.
      await tx`INSERT INTO users (email, name) VALUES (${email("imp-b")}, 'Bo Existing')`;
      const applied = await applyPlan(tx, plan);
      r.check("one user reused, three created", applied.usersReused === 1 && applied.usersCreated === 3, applied);
      const [bo] = await tx<{ name: string }[]>`SELECT name FROM users WHERE email = ${email("imp-b")}`;
      r.check("the existing user's name wins", bo.name === "Bo Existing");
      r.check("the count-back agrees with the plan", (await verifyApplied(tx, plan, applied)).length === 0);
      const hid = applied.householdId;
      const [h] = await tx<{ tagline: string; mode: string; lastSendDate: string; joined: number; welcomed: number }[]>`
        SELECT h.tagline, h.mode, h.last_send_date AS "lastSendDate",
          (SELECT count(*) FROM memberships m WHERE m.household_id = h.id AND m.joined_at IS NOT NULL) AS joined,
          (SELECT count(*) FROM memberships m WHERE m.household_id = h.id AND m.welcomed_at IS NOT NULL) AS welcomed
        FROM households h WHERE h.id = ${hid}`;
      r.check("household row: tagline, mode, last send date; everyone joined, one welcomed", h.tagline === "1 Test St" && h.mode === "ledger" && h.lastSendDate === "2026-10-13" && h.joined === 4 && h.welcomed === 1, h);
      const bills = await tx<{ id: number; status: string; pdfPath: string | null; ownerId: number | null; hadOwner: boolean; shares: number; ownerShare: boolean; notified: boolean; kind: string | null }[]>`
        SELECT id, status, pdf_path AS "pdfPath", owner_id AS "ownerId", had_owner AS "hadOwner", shares, owner_share AS "ownerShare",
          notified_at IS NOT NULL AS notified, notice_kind AS kind
        FROM bills WHERE household_id = ${hid} ORDER BY id`;
      const id100 = applied.billIds.get(100)!;
      const got100 = bills.find((b) => b.id === id100)!;
      r.check("bill 100 landed: unpaid, owner A, 3 shares with the owner's, PDF under the household's prefix",
        got100.status === "unpaid" && got100.ownerId === applied.membershipIds.get(1) && got100.hadOwner && got100.shares === 3 && got100.ownerShare
          && got100.pdfPath === `h/${hid}/bills/2026/gas/0301-${id100}.pdf`, got100);
      r.check("nothing queued for the new-bill email, everything marked already notified", bills.every((b) => b.notified && b.kind === null));
      const got103 = bills.find((b) => b.id === applied.billIds.get(103))!;
      r.check("the house's bill has no owner and had none", got103.ownerId === null && !got103.hadOwner);
      const debts = await tx<{ billId: number; personId: number; paidAt: Date | null }[]>`
        SELECT bill_id AS "billId", person_id AS "personId", paid_at AS "paidAt" FROM bill_debts WHERE household_id = ${hid}`;
      const c100 = debts.find((d) => d.billId === id100 && d.personId === applied.membershipIds.get(3));
      r.check("C's synthesized row carries due-date noon", c100?.paidAt?.toISOString() === "2026-03-20T16:00:00.000Z", c100);
      r.check("no row for the owner or for D", !debts.some((d) => d.billId === id100 && d.personId === applied.membershipIds.get(1)) && !debts.some((d) => d.personId === applied.membershipIds.get(4)));
      const [doc] = await tx<{ filePath: string; uploadedBy: number | null }[]>`SELECT file_path AS "filePath", uploaded_by AS "uploadedBy" FROM documents WHERE household_id = ${hid}`;
      r.check("the document sits under the household's documents prefix, uploader mapped", doc.filePath === `h/${hid}/documents/lease-abc123.pdf` && doc.uploadedBy === applied.membershipIds.get(1));
      r.check("the copy list names every source file with its destination",
        applied.copies.length === 3 && applied.copies.some((c) => c.source === "2026/Gas/0301.pdf" && c.dest === got100.pdfPath) && applied.copies.some((c) => c.source === "documents/lease-abc123.pdf" && c.dest === doc.filePath), applied.copies);

      await r.throws("a second run on the same slug refuses, never takes -2", () => applyPlan(tx, plan), /already household/);
      process.env.SUPERADMIN_EMAILS = email("imp-c");
      await r.throws("an operator among the members refuses", () => applyPlan(tx, { ...plan, household: { ...plan.household, slug: `verify-${RUN}-import2` } }), /runs the site/);
      throw marker;
    });
  } catch (e) {
    if (e !== marker) throw e;
  } finally {
    if (prior === undefined) delete process.env.SUPERADMIN_EMAILS;
    else process.env.SUPERADMIN_EMAILS = prior;
  }
  const [left] = await adminSql()<{ n: number }[]>`SELECT count(*) AS n FROM households WHERE slug = ${ledger.slug}`;
  r.check("rolled back: nothing left behind", left.n === 0);
}
