import { SignJWT, jwtVerify } from "jose";
import { BRAND, appUrl } from "@/lib/brand";
import { type TenantScope, type Tx, withHousehold, withUser } from "@/lib/db";
import type { MailKind } from "@/lib/mail-kinds";

// Unsubscribe (ARCHITECTURE.md §6 "Unsubscribe", decided 2026-10-13). Household mail that isn't
// transactional carries List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058 one-click)
// and a footer link, both pointing at a signed URL that turns off one *category* of mail for one
// member: reminders, bill notices, payment receipts or admins' notes (memberships.muted_kinds,
// 0014). Digest copies go to households.digest_email rather than a member, so their link clears
// that address. Login codes, invites and deletion mail are transactional: no header, no link.
//
// The token is a jose HS256 JWT under SESSION_SECRET, audience "unsubscribe", payload
// { hid, mid, cat }, and never expires: a membership that is removed takes its links with it,
// and the recipient must be able to act on an old email. Every recipient query filters
// `NOT (category = ANY(m.muted_kinds))`, so muting stops the mail at the source, and
// sendMail refuses a mutable kind sent without its scope, so no site can forget.
//
// One category is addressed to the person, not to a member: `updates`, the operator's notes
// about the service (0016, lib/operator-mail.ts). Its token is { uid, cat } and a click sets
// users.muted_kinds; the account page has the checkbox. And one is addressed to an email with
// no account at all: `waitlist`, the launch note to the coming-soon page's list (0018). Its token
// is { wl, cat } and a click deletes the row, the only "off" an address with no account can have.

export type MailCategory = "reminders" | "notices" | "thanks" | "notes" | "digest" | "updates" | "waitlist";
/** The categories kept per member (memberships.muted_kinds); `digest` is the household's, `updates` the person's, `waitlist` an address's. */
export type MemberCategory = Exclude<MailCategory, "digest" | "updates" | "waitlist">;

/** The category each kind belongs to; a kind with none is transactional and never muted. */
export const CATEGORY_OF: Readonly<Partial<Record<MailKind, MailCategory>>> = {
  reminder: "reminders",
  new_bill: "notices",
  bill_updated: "notices",
  bill_removed: "notices",
  thanks: "thanks",
  custom: "notes",
  digest: "digest",
  batch_confirmation: "digest",
  bulk_receipt: "digest",
  operator_note: "updates",
  waitlist_note: "waitlist",
};

/** What the footer link and the unsubscribe page call each category. */
export const CATEGORY_LABEL: Readonly<Record<MailCategory, string>> = {
  reminders: "payment reminders",
  notices: "bill notices",
  thanks: "payment receipts",
  notes: "notes from the household's admins",
  digest: "digest copies",
  updates: `updates about ${BRAND.name}`,
  waitlist: `the ${BRAND.name} waitlist`,
};

/** The categories a member can turn off per household (the account page lists them in this order). */
export const MEMBER_CATEGORIES: readonly MemberCategory[] = ["reminders", "notices", "thanks", "notes"];
/** The categories a person turns off for their account as a whole. */
export const USER_CATEGORIES: readonly UserCategory[] = ["updates"];
export type UserCategory = "updates";

export const isMailCategory = (v: unknown): v is MailCategory => typeof v === "string" && v in CATEGORY_LABEL;
const isUserCategory = (v: unknown): v is UserCategory => USER_CATEGORIES.includes(v as UserCategory);
const isMemberCategory = (v: unknown): v is MemberCategory => MEMBER_CATEGORIES.includes(v as MemberCategory);

/** Household mail: one member's (or the digest address's) category in one household. */
export interface HouseholdUnsubscribe {
  householdId: number;
  /** Whose mail; null for digest copies (the household's digest address). */
  membershipId: number | null;
  category: Exclude<MailCategory, UserCategory | "waitlist">;
}

/** Mail to the person: the operator's updates, muted on their users row. */
export interface UserUnsubscribe {
  userId: number;
  category: UserCategory;
}

/** Mail to an address on the launch waitlist (0018): a click takes it off the list. */
export interface WaitlistUnsubscribe {
  waitlistEmail: string;
  category: "waitlist";
}

export type UnsubscribeScope = HouseholdUnsubscribe | UserUnsubscribe | WaitlistUnsubscribe;

export const isUserScope = (s: UnsubscribeScope): s is UserUnsubscribe => "userId" in s;
export const isWaitlistScope = (s: UnsubscribeScope): s is WaitlistUnsubscribe => "waitlistEmail" in s;

const AUDIENCE = "unsubscribe";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signUnsubscribe(s: UnsubscribeScope): Promise<string> {
  const payload = isWaitlistScope(s)
    ? { wl: s.waitlistEmail, cat: s.category }
    : isUserScope(s)
      ? { uid: s.userId, cat: s.category }
      : { hid: s.householdId, mid: s.membershipId, cat: s.category };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .sign(secretKey());
}

export async function readUnsubscribe(token: string | undefined | null): Promise<UnsubscribeScope | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE });
    const { hid, mid, uid, wl, cat } = payload;
    if (typeof wl === "string") {
      if (hid !== undefined || uid !== undefined || cat !== "waitlist" || !wl) return null;
      return { waitlistEmail: wl, category: "waitlist" };
    }
    if (Number.isInteger(uid)) {
      if (hid !== undefined || !isUserCategory(cat)) return null;
      return { userId: uid as number, category: cat };
    }
    if (!Number.isInteger(hid) || !(mid === null || Number.isInteger(mid)) || !isMailCategory(cat) || isUserCategory(cat) || cat === "waitlist") return null;
    return { householdId: hid as number, membershipId: (mid ?? null) as number | null, category: cat };
  } catch {
    return null;
  }
}

export const UNSUBSCRIBE_PATH = "/unsubscribe";
/** The one-click endpoint (POST from the mail provider); a GET here redirects to the page. */
export const UNSUBSCRIBE_API = "/api/unsubscribe";

/** The URL in the headers and the footer: the API path, which answers one-click POSTs and sends people to the page. */
export async function unsubscribeUrl(s: UnsubscribeScope): Promise<string> {
  return appUrl(`${UNSUBSCRIBE_API}?${new URLSearchParams({ k: await signUnsubscribe(s) })}`);
}

export interface UnsubscribeTarget {
  /** Who the mail comes from: the household's name, or the product's for updates. */
  source: string;
  category: MailCategory;
  /** The member's name, or null for the digest address. */
  memberName: string | null;
  /** Already off (a second click, or set from the account page). */
  alreadyOff: boolean;
}

/**
 * What a token points at, for the page; null when the membership, household or account is gone.
 * A waitlist token always describes: an address that is no longer on the list is "already off".
 */
export async function describeUnsubscribe(s: UnsubscribeScope): Promise<UnsubscribeTarget | null> {
  if (isWaitlistScope(s)) {
    const rows = await withUser(null, (tx) => tx`SELECT 1 FROM waitlist WHERE email = ${s.waitlistEmail}`);
    return { source: BRAND.name, category: s.category, memberName: null, alreadyOff: rows.length === 0 };
  }
  if (isUserScope(s)) {
    const [u] = await withUser(null, (tx) => tx<{ name: string; muted: string[] }[]>`SELECT name, muted_kinds AS muted FROM users WHERE id = ${s.userId}`);
    return u ? { source: BRAND.name, category: s.category, memberName: u.name, alreadyOff: u.muted.includes(s.category) } : null;
  }
  const scope: TenantScope = { household: { id: s.householdId }, user: null };
  return withHousehold(scope, async (tx) => {
    if (s.membershipId === null) {
      const [h] = await tx<{ name: string; digest: string | null }[]>`SELECT name, digest_email AS digest FROM households WHERE id = app_household_id()`;
      return h ? { source: h.name, category: s.category, memberName: null, alreadyOff: h.digest === null } : null;
    }
    const [m] = await tx<{ householdName: string; memberName: string; muted: string[] }[]>`
      SELECT h.name AS "householdName", u.name AS "memberName", m.muted_kinds AS muted
      FROM memberships m JOIN households h ON h.id = m.household_id JOIN users u ON u.id = m.user_id
      WHERE m.id = ${s.membershipId} AND m.household_id = app_household_id()`;
    return m ? { source: m.householdName, category: s.category, memberName: m.memberName, alreadyOff: m.muted.includes(s.category) } : null;
  });
}

/**
 * Turns that category off. True when a row was found (muted now or already); false when it's
 * gone. A waitlist click deletes the row and is always true: off the list is the whole point.
 */
export async function applyUnsubscribe(s: UnsubscribeScope): Promise<boolean> {
  if (isWaitlistScope(s)) {
    await withUser(null, (tx) => tx`DELETE FROM waitlist WHERE email = ${s.waitlistEmail}`);
    return true;
  }
  if (isUserScope(s)) {
    const r = await withUser(null, (tx) => tx`
      UPDATE users SET muted_kinds = (SELECT array_agg(DISTINCT k) FROM unnest(array_append(muted_kinds, ${s.category}::text)) k)
      WHERE id = ${s.userId}`);
    return r.count > 0;
  }
  const scope: TenantScope = { household: { id: s.householdId }, user: null };
  return withHousehold(scope, async (tx) => {
    if (s.membershipId === null) {
      if (s.category !== "digest") return false;
      const r = await tx`UPDATE households SET digest_email = NULL WHERE id = app_household_id()`;
      return r.count > 0;
    }
    if (s.category === "digest") return false;
    const r = await tx`
      UPDATE memberships SET muted_kinds = (SELECT array_agg(DISTINCT k) FROM unnest(array_append(muted_kinds, ${s.category}::text)) k)
      WHERE id = ${s.membershipId} AND household_id = app_household_id()`;
    return r.count > 0;
  });
}

/** The account page: the member's whole list at once (what's unchecked is muted). */
export async function setMutedKinds(tx: Tx, membershipId: number, muted: MailCategory[]): Promise<void> {
  const clean = [...new Set(muted.filter(isMemberCategory))];
  await tx`UPDATE memberships SET muted_kinds = ${clean}::text[] WHERE id = ${membershipId} AND household_id = app_household_id()`;
}

/** The account page: the person's own muted categories (users.muted_kinds). Under withUser. */
export async function getUserMutedKinds(tx: Tx, userId: number): Promise<string[]> {
  const [u] = await tx<{ muted: string[] }[]>`SELECT muted_kinds AS muted FROM users WHERE id = ${userId}`;
  return u?.muted ?? [];
}

/** The account page's per-person list (users.muted_kinds): under withUser(that user). */
export async function setUserMutedKinds(tx: Tx, userId: number, muted: MailCategory[]): Promise<void> {
  const clean = [...new Set(muted.filter(isUserCategory))];
  await tx`UPDATE users SET muted_kinds = ${clean}::text[] WHERE id = ${userId}`;
}

/** The footer's "Unsubscribe from …" wording, in a sentence a recipient can act on. */
export function unsubscribeLabel(category: MailCategory): string {
  return category === "waitlist" ? "Take me off the waitlist" : `Unsubscribe from ${CATEGORY_LABEL[category]}`;
}

/** The sender identity every footer carries (a physical sender, not just a domain). */
export const SENDER_IDENTITY = `${BRAND.name} · ${BRAND.legalName}`;
