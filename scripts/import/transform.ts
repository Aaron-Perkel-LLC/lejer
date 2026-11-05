// The pure half of the import: a legacy household's rows plus what it becomes here, in;
// the rows to insert, out. No I/O, so the `import` verify suite can feed it a hand-built
// source. The rules are ARCHITECTURE.md §11's, brought up to today's schema:
//
//   - Users dedupe by normalized email; a person's name is only used when the user is new.
//   - Every bill's owner is its type's owner *as of import* (0004): the old apps never recorded
//     a per-bill owner. In single_payer the payer owns every type.
//   - The old apps deleted a debt row when someone paid, so the source holds only *unpaid* rows.
//     Those are copied with paid_at NULL, minus the owner's own rows (self-debts). Then every
//     splitter (as of import) who is not the owner and has no row gets a synthesized row,
//     paid_at = the due date at noon in the household's zone: "paid by around the due date",
//     nothing more precise was ever recorded.
//   - The frozen split (0005) is read back the way the 0005 backfill did it: shares from
//     total / per person, owner_share when there are more shares than debtors, fee = the type's
//     fee capped at the total.
//   - Nothing is queued for the new-bill email (notice_kind NULL); notified_at is stamped at
//     import so a later edit reads as "Corrected", never as a first announcement.

import { normalizeEmail } from "@/lib/login-codes";
import { isReservedSlug, SLUG_RE } from "@/lib/paths";
import { daysBetween, localDate, localHour } from "@/lib/time";
import type { ColorScheme, HouseholdMode, Theme } from "@/lib/types";
import type { Source } from "./source";

export interface HouseSpec {
  slug: string;
  name: string;
  tagline: string | null;
  mode: HouseholdMode;
  theme: Theme;
  colorScheme: ColorScheme;
  askBillDate: boolean;
  timezone: string;
  features: { rent: boolean; trends: boolean; bulkEmail: boolean; documents: boolean; welcomeTour: boolean; thanks: boolean };
  /** single_payer only: the person whose membership owns every bill type. */
  payerEmail?: string;
}

export interface HouseholdRow {
  slug: string;
  name: string;
  tagline: string | null;
  mode: HouseholdMode;
  theme: Theme;
  colorScheme: ColorScheme;
  timezone: string;
  askBillDate: boolean;
  featureRent: boolean;
  featureTrends: boolean;
  featureBulkEmail: boolean;
  featureDocuments: boolean;
  featureWelcomeTour: boolean;
  featureThanks: boolean;
  monthlyRent: number | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  remindersEnabled: boolean;
  sendHour: number;
  firstReminderDays: number;
  urgentReminderDays: number;
  lastRunAt: Date | null;
  lastSendDate: string | null;
  lastSentAt: Date | null;
  lastSentCount: number;
  replyTo: string | null;
}
export interface PlanUser {
  email: string;
  name: string;
}
export interface PlanMember {
  key: number; // source people.id
  email: string;
  role: "admin" | "member";
  splitsBills: boolean;
  welcomedAt: Date | null;
}
export interface PlanType {
  key: number; // source bill_types.id
  name: string;
  emoji: string | null;
  processingFee: number;
  ownerKey: number | null;
}
export interface PlanDebt {
  personKey: number;
  paidAt: Date | null;
  synthesized: boolean;
}
export interface PlanBill {
  key: number; // source bills.id
  typeKey: number;
  billDate: string;
  dueDate: string;
  total: number;
  perPersonCost: number;
  fee: number;
  shares: number;
  ownerShare: boolean;
  ownerKey: number | null;
  addedByKey: number | null;
  sourcePdf: string | null;
  status: "unpaid" | "paid";
  sourceStatus: "unpaid" | "paid";
  debts: PlanDebt[];
}
export interface PlanDocument {
  title: string;
  category: string;
  sourcePath: string;
  fileName: string; // the key's basename, kept under h/{id}/documents/
  contentType: string;
  fileSize: number;
  uploadedAt: Date;
  uploadedByKey: number | null;
}
export interface PlanStats {
  debtsCopied: number;
  debtsDropped: number; // self-debts
  debtsSynthesized: number;
  billsFlipped: number; // status differs from the source's
  blobs: number;
}
export interface Plan {
  household: HouseholdRow;
  users: PlanUser[];
  members: PlanMember[];
  types: PlanType[];
  bills: PlanBill[];
  documents: PlanDocument[];
  stats: PlanStats;
}

/** Noon on a calendar day in a zone, as an instant. DST-safe: the offset is read at that day. */
export function localNoon(ymd: string, timezone: string): Date {
  const guess = new Date(`${ymd}T12:00:00Z`);
  // How far the zone's wall clock is from UTC at that instant, in whole hours (every zone a
  // household can pick is on an hour or half-hour; half-hours round, which is close enough
  // for "around the due date").
  const dayShift = daysBetween(ymd, localDate(timezone, guess)) * 24;
  const offsetHours = dayShift + localHour(timezone, guess) - 12;
  return new Date(guess.getTime() - offsetHours * 3_600_000);
}

export function transform(src: Source, spec: HouseSpec): Plan {
  if (!SLUG_RE.test(spec.slug) || isReservedSlug(spec.slug)) throw new Error(`"${spec.slug}" is not a usable slug`);

  // People → users (deduped by normalized email) and members (one per person).
  const emailOf = new Map<number, string>();
  const users = new Map<string, PlanUser>();
  for (const p of src.people) {
    const email = normalizeEmail(p.email);
    if (!email) throw new Error(`person ${p.id} (${p.name}) has an unusable email "${p.email}"`);
    if ([...emailOf.values()].includes(email)) throw new Error(`two people share ${email}`);
    emailOf.set(p.id, email);
    if (!users.has(email)) users.set(email, { email, name: p.name.trim() || email.split("@")[0] });
  }
  const members: PlanMember[] = src.people.map((p) => ({
    key: p.id,
    email: emailOf.get(p.id)!,
    role: p.isAdmin ? "admin" : "member",
    splitsBills: p.splitsBills,
    welcomedAt: p.welcomedAt,
  }));
  const personKeys = new Set(members.map((m) => m.key));
  const splitters = members.filter((m) => m.splitsBills).map((m) => m.key);

  // Types and their owners.
  let payerKey: number | null = null;
  if (spec.mode === "single_payer") {
    const payerEmail = normalizeEmail(spec.payerEmail);
    const payer = members.find((m) => m.email === payerEmail);
    if (!payer) throw new Error(`single_payer needs payerEmail to name a person; "${spec.payerEmail}" isn't one`);
    payerKey = payer.key;
  }
  const types: PlanType[] = src.billTypes.map((t) => ({
    key: t.id,
    name: t.name.trim(),
    emoji: t.emoji.trim() || null,
    processingFee: t.processingFee,
    ownerKey: spec.mode === "single_payer" ? payerKey : t.ownerId !== null && personKeys.has(t.ownerId) ? t.ownerId : null,
  }));
  const typeByKey = new Map(types.map((t) => [t.key, t]));

  // Bills and their debt rows.
  const debtsByBill = new Map<number, number[]>();
  for (const d of src.debts) {
    if (!personKeys.has(d.personId)) throw new Error(`bill ${d.billId} has a debt row for unknown person ${d.personId}`);
    debtsByBill.set(d.billId, [...(debtsByBill.get(d.billId) ?? []), d.personId]);
  }
  const stats: PlanStats = { debtsCopied: 0, debtsDropped: 0, debtsSynthesized: 0, billsFlipped: 0, blobs: 0 };
  const bills: PlanBill[] = src.bills.map((b) => {
    const type = typeByKey.get(b.typeId);
    if (!type) throw new Error(`bill ${b.id} has unknown type ${b.typeId}`);
    const owner = type.ownerKey;
    const debts: PlanDebt[] = [];
    for (const personKey of new Set(debtsByBill.get(b.id) ?? [])) {
      if (personKey === owner) stats.debtsDropped++;
      else {
        debts.push({ personKey, paidAt: null, synthesized: false });
        stats.debtsCopied++;
      }
    }
    const paidAt = localNoon(b.dueDate, spec.timezone);
    for (const personKey of splitters) {
      if (personKey === owner || debts.some((d) => d.personKey === personKey)) continue;
      debts.push({ personKey, paidAt, synthesized: true });
      stats.debtsSynthesized++;
    }
    const shares = b.perPersonCost > 0 ? Math.max(1, Math.round(b.total / b.perPersonCost)) : debts.length + (owner !== null ? 1 : 0);
    const status = debts.some((d) => d.paidAt === null) ? "unpaid" : "paid";
    if (status !== b.status) stats.billsFlipped++;
    if (b.pdfPath) stats.blobs++;
    return {
      key: b.id,
      typeKey: type.key,
      billDate: b.billDate,
      dueDate: b.dueDate,
      total: b.total,
      perPersonCost: b.perPersonCost,
      fee: Math.min(type.processingFee, b.total),
      shares,
      ownerShare: owner !== null && shares > debts.length,
      ownerKey: owner,
      addedByKey: b.addedById !== null && personKeys.has(b.addedById) ? b.addedById : null,
      sourcePdf: b.pdfPath,
      status,
      sourceStatus: b.status,
      debts,
    };
  });

  const documents: PlanDocument[] = src.documents.map((d) => ({
    title: d.title,
    category: d.category,
    sourcePath: d.filePath,
    fileName: d.filePath.slice(d.filePath.lastIndexOf("/") + 1),
    contentType: d.contentType,
    fileSize: d.fileSize,
    uploadedAt: d.uploadedAt,
    uploadedByKey: d.uploadedById !== null && personKeys.has(d.uploadedById) ? d.uploadedById : null,
  }));
  stats.blobs += documents.length;

  const rem = src.reminders;
  const payer = payerKey !== null ? members.find((m) => m.key === payerKey)! : null;
  const household: HouseholdRow = {
    slug: spec.slug,
    name: spec.name,
    tagline: spec.tagline,
    mode: spec.mode,
    theme: spec.theme,
    colorScheme: spec.colorScheme,
    timezone: spec.timezone,
    askBillDate: spec.askBillDate,
    featureRent: spec.features.rent,
    featureTrends: spec.features.trends,
    featureBulkEmail: spec.features.bulkEmail,
    featureDocuments: spec.features.documents,
    featureWelcomeTour: spec.features.welcomeTour,
    featureThanks: spec.features.thanks,
    monthlyRent: src.rent?.monthlyRent ?? null,
    leaseStart: src.rent?.leaseStart ?? null,
    leaseEnd: src.rent?.leaseEnd ?? null,
    remindersEnabled: rem?.enabled ?? true,
    sendHour: rem?.sendHour ?? 9,
    firstReminderDays: rem?.firstReminderDays ?? 7,
    urgentReminderDays: rem?.urgentReminderDays ?? 3,
    lastRunAt: rem?.lastRunAt ?? null,
    // Carried so the first tick here doesn't send a second batch on a day the old app already did.
    lastSendDate: rem?.lastSendDate ?? null,
    lastSentAt: rem?.lastSentAt ?? null,
    lastSentCount: rem?.lastSentCount ?? 0,
    // Household mail replies go to the payer in single_payer, else to the first admin.
    replyTo: payer?.email ?? members.find((m) => m.role === "admin")?.email ?? null,
  };

  return { household, users: [...users.values()], members, types, bills, documents, stats };
}
