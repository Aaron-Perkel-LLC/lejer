import { adminSql, type Tx } from "@/lib/db";
import { isReservedSlug } from "@/lib/paths";
import type { ColorScheme, Household, HouseholdMode, Membership, ReminderRun, Theme, User } from "@/lib/types";

// Households, memberships and the switcher list. Every function takes the caller's tx except
// createHousehold(), which is one of the four owner-role call sites (CLAUDE.md): a new user has
// no household for app.household_id to name, so RLS could never admit the insert.

const householdColumns = (tx: Tx) => tx`
  h.id, h.slug, h.name, h.tagline, h.mode, h.theme, h.color_scheme AS "colorScheme", h.timezone,
  h.ask_bill_date AS "askBillDate", h.bills_per_page AS "billsPerPage",
  h.feature_rent AS "featureRent", h.feature_trends AS "featureTrends",
  h.feature_bulk_email AS "featureBulkEmail", h.feature_documents AS "featureDocuments",
  h.feature_welcome_tour AS "featureWelcomeTour", h.feature_thanks AS "featureThanks",
  h.feature_owner_checkoff AS "featureOwnerCheckoff",
  h.monthly_rent AS "monthlyRent", h.lease_start AS "leaseStart", h.lease_end AS "leaseEnd",
  h.reminders_enabled AS "remindersEnabled", h.send_hour AS "sendHour",
  h.first_reminder_days AS "firstReminderDays", h.urgent_reminder_days AS "urgentReminderDays",
  h.from_name AS "fromName", h.reply_to AS "replyTo", h.digest_email AS "digestEmail",
  h.deletion_requested_at AS "deletionRequestedAt", h.deletion_requested_by AS "deletionRequestedBy",
  h.delete_after AS "deleteAfter"`;

const membershipColumns = (tx: Tx) => tx`
  m.id, m.household_id AS "householdId", m.user_id AS "userId", m.role,
  m.splits_bills AS "splitsBills", m.welcomed_at AS "welcomedAt", m.joined_at AS "joinedAt", m.muted_kinds AS "mutedKinds"`;

/**
 * The user's membership + household: the one with householdId if given and still valid,
 * otherwise their first (joined before pending, then oldest). Runs under withUser, where
 * memberships_read/households_read admit the user's own rows.
 */
export async function findMembership(
  tx: Tx,
  userId: number,
  householdId: number | null,
): Promise<{ membership: Membership; household: Household } | null> {
  const [membership] = await tx<Membership[]>`
    SELECT ${membershipColumns(tx)} FROM memberships m
    WHERE m.user_id = ${userId}
    ORDER BY (m.household_id = ${householdId ?? -1}) DESC, (m.joined_at IS NULL), m.id
    LIMIT 1`;
  if (!membership) return null;
  const [household] = await tx<Household[]>`
    SELECT ${householdColumns(tx)} FROM households h WHERE h.id = ${membership.householdId}`;
  return household ? { membership, household } : null;
}

/**
 * The household this transaction is scoped to (app.household_id), with the cron's bookkeeping.
 * For system scopes that start from an id (the cron, the CLI) and for the settings readout.
 */
export async function getCurrentHousehold(tx: Tx): Promise<(Household & ReminderRun) | null> {
  const [household] = await tx<(Household & ReminderRun)[]>`
    SELECT ${householdColumns(tx)},
      h.last_run_at AS "lastRunAt", h.last_send_date AS "lastSendDate",
      h.last_sent_at AS "lastSentAt", h.last_sent_count AS "lastSentCount"
    FROM households h WHERE h.id = app_household_id()`;
  return household ?? null;
}

export async function getUserByEmail(tx: Tx, email: string): Promise<User | null> {
  const [user] = await tx<User[]>`SELECT id, email, name FROM users WHERE email = ${email}`;
  return user ?? null;
}

export async function getUserById(tx: Tx, id: number): Promise<User | null> {
  const [user] = await tx<User[]>`SELECT id, email, name FROM users WHERE id = ${id}`;
  return user ?? null;
}

export interface MyHousehold {
  id: number;
  slug: string;
  name: string;
  membershipId: number;
  role: Membership["role"];
  joinedAt: Date | null;
  mutedKinds: string[];
}

/** A user with every membership and household of theirs: one request's whole session. */
export interface SessionRows {
  user: User;
  rows: { membership: Membership; household: Household }[];
}

type SessionRow = Household & {
  userId: number; userEmail: string; userName: string;
  membershipId: number | null; role: Membership["role"]; splitsBills: boolean; welcomedAt: Date | null; joinedAt: Date | null;
  mutedKinds: string[] | null;
};

/**
 * The signed-in user and every household they belong to, in **one statement**: the request
 * context (lib/context.ts) resolves the URL's slug against it, the switcher lists it, and
 * /households and homePath() read it, so a page costs one session transaction, not three.
 * LEFT JOINs keep a user with no memberships (onboarding). Runs under withUser(userId), where
 * memberships_read / households_read admit exactly the user's own rows and users has no RLS.
 * Ordered like the switcher: by household name.
 */
export async function loadMyHouseholds(tx: Tx, userId: number): Promise<SessionRows | null> {
  const rows = await tx<SessionRow[]>`
    SELECT u.id AS "userId", u.email AS "userEmail", u.name AS "userName",
           m.id AS "membershipId", m.role, m.splits_bills AS "splitsBills",
           m.welcomed_at AS "welcomedAt", m.joined_at AS "joinedAt", m.muted_kinds AS "mutedKinds",
           ${householdColumns(tx)}
    FROM users u
    LEFT JOIN memberships m ON m.user_id = u.id
    LEFT JOIN households h ON h.id = m.household_id
    WHERE u.id = ${userId}
    ORDER BY h.name, h.id`;
  const first = rows[0];
  if (!first) return null;
  const user: User = { id: first.userId, email: first.userEmail, name: first.userName };
  return {
    user,
    rows: rows.flatMap(({ userId: _u, userEmail: _e, userName: _n, membershipId, role, splitsBills, welcomedAt, joinedAt, mutedKinds, ...household }) =>
      membershipId === null
        ? []
        : [{ membership: { id: membershipId, householdId: household.id, userId: user.id, role, splitsBills, welcomedAt, joinedAt, mutedKinds: mutedKinds ?? [] }, household }],
    ),
  };
}

/** The switcher's view of a session row. */
export const myHousehold = ({ membership: m, household: h }: SessionRows["rows"][number]): MyHousehold => ({
  id: h.id, slug: h.slug, name: h.name, membershipId: m.id, role: m.role, joinedAt: m.joinedAt, mutedKinds: m.mutedKinds,
});

/** Your calendar token in each household you've joined, for /account. Under withUser. */
export async function listMyCalendarTokens(tx: Tx, userId: number): Promise<Map<number, string>> {
  const rows = await tx<{ householdId: number; token: string }[]>`
    SELECT household_id AS "householdId", calendar_token AS token
    FROM memberships WHERE user_id = ${userId} AND joined_at IS NOT NULL`;
  return new Map(rows.map((r) => [r.householdId, r.token]));
}

/** Marks a pending invite accepted. Must run in withHousehold for that household. */
export async function markJoined(tx: Tx, membershipId: number): Promise<void> {
  await tx`UPDATE memberships SET joined_at = now() WHERE id = ${membershipId} AND joined_at IS NULL`;
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/#/g, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "household"
  );
}

/**
 * The utilities onboarding offers (/new), each checked to start, in this order. The emoji is the
 * field's starting value, which the creator can change or clear (a utility's emoji is optional).
 */
export const STARTER_UTILITIES = [
  { key: "gas", name: "Gas", emoji: "🔥" },
  { key: "electric", name: "Electric", emoji: "⚡" },
  { key: "internet", name: "Internet", emoji: "🌐" },
  { key: "water", name: "Water", emoji: "💧" },
] as const;

export interface NewHousehold {
  userId: number;
  email: string; // seeds reply_to
  name: string;
  mode: HouseholdMode;
  theme: Theme;
  timezone: string;
  /** The utilities picked in onboarding, already validated; each is owned by the creator. */
  utilities?: { name: string; emoji: string | null; processingFee: number }[];
}

/**
 * Signup: household, its first admin membership and the utilities they picked, in one
 * owner-role transaction. The creator owns every utility: the only member, so the payer in
 * single_payer mode, and in ledger mode the owner until they reassign it in Settings. The wizard's
 * choices drive the defaults: ask_bill_date and the payer's own check-off on for single_payer, every theme but statement is light-only. The slug
 * is the household's URL (lib/paths.ts): a name that is a reserved route starts at "-2".
 */
export async function createHousehold(h: NewHousehold): Promise<{ id: number; slug: string }> {
  const base = slugify(h.name);
  const colorScheme: ColorScheme = h.theme === "statement" ? "system" : "light"; // only statement has a dark mode
  return adminSql().begin(async (tx) => {
    for (let n = isReservedSlug(base) ? 2 : 1; n <= 50; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const [row] = await tx<{ id: number }[]>`
        INSERT INTO households (slug, name, mode, theme, color_scheme, timezone, ask_bill_date, feature_owner_checkoff, reply_to)
        VALUES (${slug}, ${h.name}, ${h.mode}, ${h.theme}, ${colorScheme}, ${h.timezone},
                ${h.mode === "single_payer"}, ${h.mode === "single_payer"}, ${h.email})
        ON CONFLICT (slug) DO NOTHING
        RETURNING id`;
      if (!row) continue;
      const [member] = await tx<{ id: number }[]>`
        INSERT INTO memberships (household_id, user_id, role, joined_at)
        VALUES (${row.id}, ${h.userId}, 'admin', now())
        RETURNING id`;
      for (const u of h.utilities ?? []) {
        await tx`
          INSERT INTO bill_types (household_id, name, emoji, processing_fee, owner_id)
          VALUES (${row.id}, ${u.name}, ${u.emoji}, ${u.processingFee}, ${member.id})`;
      }
      return { id: row.id, slug };
    }
    throw new Error(`no free slug for "${base}"`);
  }) as Promise<{ id: number; slug: string }>;
}
