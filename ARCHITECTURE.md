# Lejer — architecture

Lejer (uselejer.com) merges two Next.js apps that share a lineage into one hosted, multi-tenant
household-bills app:

- **utilities** (the first household's app): one person pays every bill, everyone owes them.
- **peach** (the second household's app, whose look became the peach theme): each bill type has
  an owner who fronts it, and debts run to that owner. Forked from utilities in July 2026; ~85%
  identical code.

Both are private and not part of this repo.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind v4, one Vercel Hobby deployment, Neon
Postgres, Vercel Blob (private store), Resend. Households sign up and invite their roommates.
Small scale (a handful of households), free tiers, no billing.

This document records the decisions. `CLAUDE.md` is the working reference once code exists.

---

## 0. What the two apps are today (diff summary)

Diffing `app/`, `lib/`, `db/`, `middleware.ts`, `next.config.ts`:

| Identical (0-line diff) | Small drift | Divergent |
|---|---|---|
| `lib/db.ts`, `lib/login-codes.ts`, `DueChip`, `Pagination`, `SubmitButton`, `PaymentCheckboxes`, `RemindersSection`, `loading.tsx` files, `cal.ics/route.ts` | `middleware.ts` (demo + matcher), `session.ts` (cookie name), `mail.ts` (from name), `reminders.ts` (owner join), cron route (thanks flush), login actions (welcome redirect) | `schema.sql`, `lib/bills.ts` (owners, splitters, `getOwedPairs`, demo branches), `lib/emails.ts` (two shells), `globals.css` (two themes), `portal/actions.ts`, `page.tsx`, `layout.tsx`, `Nav.tsx` |

**utilities-only:** rent config + iCal RRULE, trends (Chart.js, hardcoded Gas/Electric), bulk
email tab, documents (client-direct Blob upload, 25 MB), thank-you receipt queue
(`payment_thanks`, debounced 10 min), public `/api/unpaid` (API key + HMAC), PDF required on
every bill (server action, 4 MB, deterministic `{year}/{type}/{MMDD}.pdf` key).

**peach-only:** `bill_types.owner_id`, `bills.added_by_id`, `people.splits_bills`,
`people.welcomed_at` + `/welcome` tour, `getOwedPairs` ledger, `APP_DEMO_MODE` + `lib/demo.ts`,
auto-stamped `bill_date`, no PDF upload, `opengraph-image`/`apple-icon` via `next/og`,
Fraunces/Karla/Courier Prime + the awning.

**Both:** mysql2 on TiDB (no FKs, `dateStrings` + `decimalNumbers`), jose 30-day sliding
cookie keyed by email, 6-digit email codes (sha256, 10 min, 5 attempts, burst dedupe),
passphrase fallback, `APP_LOCAL_DEV_USER`, nodemailer over iCloud SMTP, Vercel Blob keys ==
stored path served by `/files/[...path]` with an extension allowlist, hourly GitHub Actions
ping into `/api/cron/reminders` with a NY send hour and a once-per-day guard.

Live data (read 2026-10-06): utilities has 2 people, 4 types, 13 bills all with PDFs, and
3 documents. The peach app's size was not known at the time.

---

## 1. Conflicts and how they were resolved

Decided with Aaron:

| Conflict | Decision |
|---|---|
| Add-bill form (utilities asks statement date + requires PDF; peach auto-stamps date, no PDF) | Household setting `ask_bill_date` (column default `false`; the onboarding wizard sets it, on for single-payer and off for ledger, and settings can change it). PDF always optional; when present it is keyed by bill date as utilities does. |
| Member rights (utilities: one admin; peach: everyone admin so owners can post) | `admin` does everything. `member` reads everything and, for bill types they **own**, can post bills and mark payments. |
| Demo mode | `APP_DEMO_MODE` is gone. A hosted `/demo` on uselejer.com shows the app without an account. |
| Next.js version | 16 (`proxy.ts`, Turbopack). |

Decided here; override by editing this table:

| Topic | utilities | peach | Lejer |
|---|---|---|---|
| Payer's own share | payer gets a debt row and checks themself off | owner never gets a row | Owner-based everywhere: the payer gets no row. The import drops Aaron's self-debt rows, synthesizes paid rows for debtors the old data no longer has (§11), and reports the counts. Utilities' self check-off comes back as a setting, `feature_owner_checkoff` (0017, §3 "The payer's own check-off"): a tick on the bill, `owner_paid_at`, not a debt row. |
| Split denominator | all people | `splits_bills = 1` | Splitters. The owner counts in the denominator but gets no debt. |
| "Admin" | one admin | all residents | `memberships.role` in (`admin`, `member`). The peach app imports with its current admin flags. |
| Thank-you receipts | yes | no | Feature toggle `feature_thanks`, default on. |
| Confirmation copies (`APP_CONFIRMATION_EMAIL_TO`) | global env | global env | Per-household optional `digest_email`, default empty. Every copy spends Resend's daily budget. |
| Email voice | "Hello", "View statement", "she already covered" | "Hi", "Open the ledger" | One neutral voice (they/them). The noun ("statement" vs "ledger") follows the theme. |
| Dark mode | follows system | none, deliberately | Per theme: statement offers `system`/`light`; peach is light-only. |
| Trends | hardcoded Gas/Electric | absent | All bill types with legend toggles, behind `feature_trends`. |
| Rent + calendar | `rent_config` + iCal RRULE | absent | Columns on `households`, behind `feature_rent`. |
| Public `/api/unpaid` | yes | no | Dropped. A per-household token could return later. |
| Passphrase login | yes | yes | Dropped. |
| `APP_LOCAL_DEV_USER` | yes | yes | `APP_DEV_USER` + `APP_DEV_HOUSEHOLD`, honored only when `VERCEL_ENV !== "production"`. |
| Session cookie | `utilities_session` {email} | a per-app session cookie {email} | `lejer_session` {uid}; the household is in the URL (§5). |
| Timezone | hardcoded NY | hardcoded NY | `households.timezone` (IANA). |
| Login-code subject | "Perk Utilities login code" | a house-branded sign-in code | Lejer-branded. The household is unknown at login. |
| Footer phone number | yes | no | Dropped. |

---

## 2. Postgres port

### Driver and query layer

**postgres.js** (`postgres` on npm) over TCP to Neon's pooled endpoint, Node runtime only (the
Edge runtime is deprecated and we need interactive transactions anyway).

Why not `@neondatabase/serverless`: its HTTP mode is one statement per request, and every
tenant request here is a transaction (`set_config` + queries, see §4). Once everything is a
transaction, postgres.js is simpler: `sql.begin()`, tagged templates that read like today's raw
SQL, and per-type parsers.

```ts
// lib/db.ts
import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  prepare: false,          // PgBouncer transaction mode (Neon pooler) cannot hold prepared statements
  max: 3,                  // Fluid Compute reuses the instance; keep the pool tiny
  idle_timeout: 60,        // a pause between clicks shouldn't pay TLS + SCRAM + fetch_types again
  connect_timeout: 10,
  types: {
    date:    { to: 1082, from: [1082], serialize: (s: string) => s, parse: (s: string) => s },
    numeric: { to: 1700, from: [1700], serialize: String, parse: Number },
    int8:    { to: 20,   from: [20],   serialize: String, parse: Number },
  },
});
```

- `DATE` stays `YYYY-MM-DD` (replaces `dateStrings`). No `Date` objects for bill/due dates.
- `NUMERIC(10,2)` parses to `number` (replaces `decimalNumbers`). Money math stays
  `Math.round(x * 100) / 100` as today.
- `COUNT(*)` is `int8`; parse to `number` (our counts never exceed 2^53).
- `TIMESTAMPTZ` stays a JS `Date`; format at the edge.

**Raw SQL, no ORM.** Ten tables, every query already hand-aliases `snake_case AS camelCase`,
and row-level security needs a `set_config` call per transaction either way. Drizzle would add
a schema DSL and a migration tool for little gain at this size; revisit if the schema grows.
Migrations are numbered SQL files in `db/migrations/` applied by `scripts/migrate.ts`
(records applied files in `schema_migrations`), run with the owner connection.

### DDL mapping

| MySQL/TiDB | Postgres |
|---|---|
| `INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `TINYINT(1)` | `BOOLEAN` |
| `DATETIME` (UTC by convention) | `TIMESTAMPTZ` |
| `DECIMAL(10,2)` | `NUMERIC(10,2)` |
| `ENUM('unpaid','paid')` | `TEXT NOT NULL CHECK (status IN ('unpaid','paid'))` — same for `mode`, `theme`, `role`, `color_scheme`. A CHECK is one `ALTER` to extend; a `CREATE TYPE` enum is not. |
| `VARCHAR(254) UNIQUE` email | `CITEXT UNIQUE` (`CREATE EXTENSION citext`) so `LOWER(email) = ?` goes away |
| `UTC_TIMESTAMP()` | `now()` |
| `... + INTERVAL 10 MINUTE` | `... + interval '10 minutes'` |
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT (...) DO UPDATE` |
| `LAST_INSERT_ID()` / `result.insertId` | `INSERT ... RETURNING id` |
| `DATE_FORMAT(d, '%Y-%m')` | `to_char(d, 'YYYY-MM')` |
| `SUM(cond)` in MySQL | `COUNT(*) FILTER (WHERE cond)` |
| `LIMIT ${n} OFFSET ${m}` interpolated | `LIMIT ${n} OFFSET ${m}` as bound params |
| `IN (${placeholders})` | `= ANY(${ids})` |
| No FKs | Real FKs, below |

### Foreign keys and ON DELETE

| FK | ON DELETE | Replaces |
|---|---|---|
| `memberships.user_id → users` | CASCADE | — |
| `memberships.household_id → households` | CASCADE | — |
| `bill_types.owner_id → memberships` | SET NULL | `removePerson` nulling `owner_id`; UI warns in single-payer mode |
| `bills.type_id → bill_types` | RESTRICT | `removeBillType` refusing while bills exist (keep the friendly check in the action too) |
| `bills.added_by_id → memberships` | SET NULL | `LEFT JOIN people pa` |
| `bills.owner_id → memberships` (0004) | SET NULL | — (the old apps read the type's current owner) |
| `bill_debts.bill_id → bills` | CASCADE | — |
| `bill_debts.person_id → memberships` | CASCADE | `removePerson` deleting debts |
| `payment_thanks.*` | CASCADE | `removePerson` deleting thanks |
| `documents.uploaded_by → memberships` | SET NULL | `LEFT JOIN people` so a document outlives its uploader |
| `documents.household_id`, `bill_types.household_id`, … `→ households` | CASCADE | deleting a household removes everything |
| `email_log.household_id → households` (0009) | SET NULL | was CASCADE: a deleted household's sends still count toward the day's Resend budget |
| `households.deletion_requested_by → memberships` (0009) | SET NULL | — |
| `deletion_approvals.* → households / memberships` (0009) | CASCADE | — |

The SET NULL FKs above are composite too (next paragraph), so they name the column to null —
`ON DELETE SET NULL (owner_id)` (Postgres 15+) — or Postgres would also null the `NOT NULL`
`household_id`.

Child tables carry a denormalized `household_id` with **composite FKs** so RLS never needs a
join and a child can never point across tenants:

```sql
ALTER TABLE bills ADD UNIQUE (id, household_id);
ALTER TABLE bill_debts
  ADD FOREIGN KEY (bill_id, household_id) REFERENCES bills (id, household_id) ON DELETE CASCADE,
  ADD FOREIGN KEY (person_id, household_id) REFERENCES memberships (id, household_id) ON DELETE CASCADE;
```

---

## 3. Data model: one model, two modes

```
households      id, slug UNIQUE, name, tagline,
                mode            TEXT CHECK IN ('single_payer','ledger'),
                theme           TEXT CHECK IN ('statement','peach'),
                color_scheme    TEXT CHECK IN ('system','light'),
                timezone        TEXT (IANA, default 'America/New_York'),
                ask_bill_date   BOOLEAN DEFAULT false, bills_per_page INT DEFAULT 10,
                feature_rent, feature_trends, feature_bulk_email, feature_documents,
                feature_welcome_tour, feature_thanks   BOOLEAN,
                monthly_rent NUMERIC(10,2) NULL, lease_start DATE NULL, lease_end DATE NULL,
                reminders_enabled BOOLEAN, send_hour SMALLINT, first_reminder_days SMALLINT,
                urgent_reminder_days SMALLINT,
                last_run_at TIMESTAMPTZ, last_send_date DATE, last_sent_at TIMESTAMPTZ, last_sent_count INT,
                from_name TEXT NULL, reply_to CITEXT NULL, digest_email CITEXT NULL,
                deletion_requested_at TIMESTAMPTZ NULL, deletion_requested_by NULL → memberships,
                delete_after TIMESTAMPTZ NULL                -- deleting a household (0009, §5)
                created_at TIMESTAMPTZ
users           id, email CITEXT UNIQUE, name, created_at                           -- global, no household
memberships     id, household_id, user_id, role TEXT CHECK IN ('admin','member'),
                splits_bills BOOLEAN, welcomed_at TIMESTAMPTZ NULL,
                invited_by INT NULL → memberships, invited_at, joined_at TIMESTAMPTZ NULL,
                calendar_token TEXT NOT NULL UNIQUE (32 random bytes, base64url, column default),
                UNIQUE (household_id, user_id), UNIQUE (id, household_id)
bill_types      id, household_id, name, emoji NULL (0012), processing_fee NUMERIC(10,2), owner_id → memberships NULL,
                UNIQUE (household_id, name), UNIQUE (id, household_id)
bills           id, household_id, type_id, bill_date DATE, due_date DATE, total, per_person_cost,
                status, pdf_path TEXT NULL, added_by_id NULL,
                owner_id NULL → memberships, had_owner BOOLEAN       -- snapshotted at post time (0004)
                fee, shares, owner_share,                             -- the frozen split (0005)
                notice_kind, notice_queued_at, notice_extra INT[], notified_at  -- the email queue (0005)
                UNIQUE (id, household_id)
bill_debts      household_id, bill_id, person_id, paid_at TIMESTAMPTZ NULL,  PRIMARY KEY (bill_id, person_id)
                                                                     -- permanent rows (0003)
payment_thanks  household_id, bill_id, person_id, queued_at, PRIMARY KEY (bill_id, person_id)
deletion_approvals household_id, membership_id, approved_at, PRIMARY KEY (household_id, membership_id)  -- 0009
documents       id, household_id, title, category, file_path, content_type, file_size, uploaded_at, uploaded_by NULL
login_codes     id, email CITEXT, code_hash CHAR(64), attempts SMALLINT, ip_hash CHAR(64) NULL,
                created_at, expires_at                          -- no household; keyed by email (0002)
email_log       id, household_id NULL, kind TEXT, to_hash CHAR(64), ok BOOLEAN, sent_at TIMESTAMPTZ
                                                                                     -- daily budget + readouts
schema_migrations filename, applied_at
```

`rent_config` and `reminder_config` (single-row tables) fold into `households` columns.
`people` splits into global `users` (login identity) and per-household `memberships` (role,
`splits_bills`, `welcomed_at`). Display name lives on `users`: one person, one name.

### Mode semantics

Both modes run on **owner-based splits**. `households.mode` is a setting that drives defaults
and simplifies the UI; it never changes how debts are stored.

- **single_payer** = every `bill_types.owner_id` is the same membership (the payer). New types
  default to the payer; the type form hides the owner column; the dashboard shows "You owe $X"
  and the house ledger collapses to one creditor; add-bill flash copy says "split with the
  house". The onboarding wizard turns `ask_bill_date` on.
- **ledger** = types carry their own owners. Owner column shown; dashboard shows who-owes-whom
  pairs (`getOwedPairs`); new-bill emails tell debtors who to pay and the owner who owes them.
  The wizard leaves `ask_bill_date` off (the column default, `false`).
- **Switching** is a settings change. `ledger → single_payer` asks "who pays?" and bulk-sets
  every type's owner to that membership. `single_payer → ledger` just reveals the owner column.
  Existing bills and debts are untouched in both directions. No migration.

### Split math (unchanged from the peach app, which generalizes utilities)

`total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)` where
splitters = memberships with `splits_bills` true (owner included; pending invites too). Debt
rows for every splitter **except** the owner. Non-splitters (the maintainer pattern) sign in,
see everything, never owe, never get emails. Money math is done in cents.

### Each bill keeps its owner (0004, decided 2026-10-06)

A bill's creditor used to be its type's *current* owner, so handing Gas from one roommate to
another moved every old unpaid Gas bill to the new owner (who might even be a debtor on it).
Posting now snapshots the type's owner into `bills.owner_id` (composite FK with `household_id`,
`ON DELETE SET NULL (owner_id)`), plus `had_owner`. The type's owner only decides who owns new
bills. The ledger, balances, reminder Reply-To and "may manage this bill" all read the bill's
owner, so the old owner keeps managing (and being owed on) their old bills after a reassignment.
When an owner's membership is removed, `owner_id` goes NULL and `had_owner` keeps the bill
reading as "former member" (only an admin can manage it then); a bill posted for a type with
no owner has `had_owner = false` and is owed to "the house". Existing rows were backfilled
from their type's owner when 0004 ran.

### Debt rows are permanent (0003, decided 2026-10-06)

Both source apps deleted a `bill_debts` row when someone paid, so the original debtor set was
lost; unchecking a payment had to rebuild debts from *today's* splitters, which re-added the
wrong people (anyone who joined after the bill). Lejer keeps the rows:

- The row set is written once, when the bill is posted (`createBill`). The one exception is
  an edit before anyone has paid (0005, below), which rebuilds the rows over the same frozen
  split set; once a row carries `paid_at` the bill is locked and its rows are never rebuilt.
- Paying sets `paid_at = now()`; un-paying sets it `NULL` (`setPaid`, one row at a time,
  transactional). Unchecking therefore restores exactly the original debtor, and someone who
  joined later can never gain a row on an old bill.
- A bill is `paid` exactly when none of its rows has `paid_at IS NULL`. `bills.status` is kept
  in step in the same transaction (`refreshBillStatus`), including when removing a member
  cascades their rows away.
- Balances, the owed-pairs ledger and reminders all read `paid_at IS NULL`.
- Not chosen: comparing `memberships.invited_at` to the bill's date to decide eligibility.
  Imported memberships get `invited_at` = import time, after every historical bill, so nobody
  could ever be re-added on old bills.

### The payer's own check-off (0017, decided 2026-10-14)

On utilities the payer had a debt row like everyone else, and ticking themself off doubled as
"I paid the provider": the bill stayed unpaid, and the reminders nagged *them*, until they did.
Lejer dropped the self-row (above) and with it that use. It comes back as a household setting,
`feature_owner_checkoff`, and a column, `bills.owner_paid_at` (NULL = the owner hasn't said),
rather than a row, so the ledger between people is untouched: `getOwedPairs`, balances, the
net hint, thanks, the calendar feed and the CSV never see it.

- **Status.** `refreshBillStatus` reads one rule (`statusCase`): unpaid while any debt row is
  open, **or** while the setting is on, the bill has an owner, and `owner_paid_at IS NULL`;
  paid otherwise. So with the setting on, a bill everyone has paid back stays Unpaid, in the
  owner's list, until they tick it; the roommates' own "You owe" rows clear as soon as they pay.
- **Posting.** With the setting on and the type owned, `owner_paid_at` starts NULL (the
  `addBill` flash says "Tick it off once you've paid the provider"); with it off, it's written
  as `now()`, settled. Existing bills were backfilled as settled when 0017 ran. Hence turning
  the setting on later never reopens old bills: only bills posted while it's on carry the box,
  and the first imported household's four open ones are unticked by hand.
- **Toggling.** `saveSettings` recomputes every bill's status (`refreshAllBillStatuses`) when
  the flag changes, both ways; the column is kept, so off-then-on finds things as they were.
- **The tick** is `setPaid` with the owner's own membership id: it sets or clears
  `owner_paid_at` instead of a row, queues no receipt, and never locks the bill (the edit lock
  stays "someone has been marked paid"). `Bill.ownerPaid` is `true`/`false` with the setting
  on and an owner, else `null`, and `PaymentCheckboxes` leads with "You paid the provider" (or
  "{owner} paid the provider") when it isn't null. An edit that changes the owner resets the
  tick for the new owner (open, or settled with the setting off); one that keeps the owner keeps it.
- **Reminders.** `dueReminders` adds a `provider` reminder for the owner of every open-ticked
  bill on the same cadence (§8), with the bill's total, no "Pay to", and the household's default
  Reply-To rather than the owner's own address. The per-bill Remind button stays about debtors
  and is hidden once nobody owes.
- **Default.** Off; `createHousehold()` turns it on for a new single-payer household (the
  survey's two-thirds, and the case where the payer's own payment is the whole point), off for
  ledger. The `bills`, `features`, `cron`, `identity` and `http` suites cover it.

### Fixing a posted bill (0005, decided 2026-10-07)

The 2026-10-07 critique's open P1: a posted bill was irreversible and its email went out at once.

- **The new-bill email waits in a queue.** Posting sets `bills.notice_kind = 'new'` and
  `notice_queued_at = now()` instead of mailing. `lib/notices.ts` sends it once it has sat for
  `NOTICE_DELAY_MINUTES` (10, in `lib/notice-delay.ts` so client copy can say it), flushed by
  every cron tick and, through `after()`, by every bill mutation, like the thanks queue, and
  a mutation that leaves anything queued publishes the ten-minute wake-up (§8 "Wake-ups",
  decided 2026-10-22), so the email lands at the ten-minute mark rather than 10 to about 70
  minutes after posting, which is where it sat while the hourly tick was the only clock (Neon's
  CU budget rules out a faster cron). The queue lives on the bill row, so deleting a bill cancels its email
  by definition. Claims are one `UPDATE … RETURNING` with `SKIP LOCKED`; a bill whose every
  send failed goes back as it was, compare-and-set, unless an edit re-queued it meanwhile. The
  email shows the bill as it is at flush time. `notified_at` records the first send.
- **Edit or delete only while nobody is marked paid** (`updateBill` / `deleteBill` in
  `lib/bills.ts`): the bill's owner or an admin; after any `paid_at` the bill is locked
  (unchecking unlocks it). Both take the same `FOR UPDATE` row lock as `setPaid`.
- **The split set is frozen at post time.** `shares` is the denominator the bill was split over
  and `owner_share` whether its owner held one of them (an owner who doesn't split doesn't);
  the set is the debtor rows plus that owner. An edit recomputes total, fee and each share over
  the same `shares` and never consults today's splitters, so someone who joined after the post
  is still not a debtor after an edit, however much later. The fee stays the bill's own `fee`
  unless the type changes.
- **Changing the type** re-snapshots the owner from the new type. The set keeps its size: the
  new owner, if they're in it, stops owing; the old owner, if they held a share, starts; a
  type with no owner means everyone in the set owes. The debt rows are rebuilt (nobody has
  paid, so they carry no history).
- **Email after an edit.** Still queued → the window restarts and one email goes out with the
  final figures. Already sent → `notice_kind = 'updated'` queues one "Corrected" email to the
  union of the debtors before and after the edit plus both owners (`notice_extra` carries the
  "before" side until the flush), so anyone the edit dropped hears about it. With a frozen set,
  that's a former owner who didn't hold a share.
- **Delete** removes the row (debts, thanks and the queued email go with it) and its PDF from
  Blob after commit. If the first email had gone out, a "Bill removed" note goes at once to the
  joined debtors and the owner (the delete was confirmed in a dialog); otherwise nobody is told,
  because nobody had heard of it.
- **PDF on edit**: a replacement uploads first under a fresh key (`{MMDD}-{billId}-{rev}.pdf`),
  so an edit refused after the upload can't have overwritten the live file; the old file is
  deleted only after the edit commits.
- Backfill: existing bills get `notified_at = created_at`, `fee` from their type's current fee,
  `shares` read back from `total / per_person_cost`, and `owner_share` when there are more
  shares than debt rows.

### Gross ledger with a net hint (decided 2026-10-07)

Gross is the truth everywhere. The dashboard's strip, its house ledger, the bills page's "Still
owed" and the reminders all show what is recorded per bill, in both directions: Alex owes Sam
$30 and Sam owes Alex $12 are two rows. When two people owe each other, `ledgerGroups()` keeps
their two rows together and adds one muted line computed by `netPairs()`: "Settling at once?
Alex pays you $18.00 and you both check off each other's bills." (or "You're even" when it
nets to zero). No net figure is ever the primary number, because a net payment can't be
recorded as such: each person still checks off each bill. Pairs owed to the house or a former
member have nobody to offset and get no hint. There is no "I sent it" flow.

(A first cut showed the net as the ledger row itself. The re-critique found one relationship
reading as three different numbers across the strip, the ledger and the bills page, so the net was
demoted to the hint.)

---

## 4. Tenancy

### Central scoping helper

Nothing queries outside a household transaction. `lib/context.ts` resolves the request once
(React `cache()`), replacing `getCurrentPerson()`:

```ts
export interface Ctx { user: User; membership: Membership; household: Household; demo: boolean }
export const getCtx = cache(async (): Promise<Ctx | null> => { /* URL slug + session → ctx (§5 Household URLs), demo */ });
```

`lib/db.ts` exposes the only sanctioned way to run tenant SQL:

```ts
export async function withHousehold<T>(ctx: Ctx, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.household_id', ${String(ctx.household.id)}, true),
                    set_config('app.user_id',      ${String(ctx.user.id)},      true)`;
    return fn(tx);
  });
}
```

Every function in `lib/bills.ts`, `lib/reminders.ts`, etc. takes `tx` as its first argument;
pages open one `withHousehold` per request and pass `tx` down. `sql` itself is not exported to
app code — only `withHousehold`, `withUser` (login-time queries on `users`/`login_codes`), and
`adminSql` (owner role, §4 "roles").

### Row-level security (second lock)

Every household table: `ENABLE ROW LEVEL SECURITY`, deliberately **not** `FORCE`. `FORCE` exists
only to subject the table owner to policies, and we want the owner (`neondb_owner`, the
migration role) exempt; plain `ENABLE` gives exactly that while `lejer_app` stays enforced.
Policies read the transaction-local GUCs. After a `SET LOCAL` transaction ends on a pooled connection the
GUC is the empty string, not NULL, and `''::int` throws, so every policy goes through `NULLIF`:

```sql
CREATE FUNCTION app_household_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.household_id', true), '')::int $$;
CREATE FUNCTION app_user_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::int $$;

-- Tenant tables (bills, bill_types, bill_debts, payment_thanks, documents, email_log):
CREATE POLICY tenant ON bills
  USING (household_id = app_household_id())
  WITH CHECK (household_id = app_household_id());

-- memberships: readable for my current household OR any row that is mine (the switcher);
-- writable only inside the current household.
CREATE POLICY memberships_read ON memberships FOR SELECT
  USING (household_id = app_household_id() OR user_id = app_user_id());
CREATE POLICY memberships_write ON memberships FOR ALL
  USING (household_id = app_household_id())
  WITH CHECK (household_id = app_household_id());

-- households: readable if current OR I am a member (names for the switcher);
-- writable only when current.
CREATE POLICY households_read ON households FOR SELECT
  USING (id = app_household_id()
         OR id IN (SELECT household_id FROM memberships WHERE user_id = app_user_id()));
CREATE POLICY households_write ON households FOR ALL
  USING (id = app_household_id())
  WITH CHECK (id = app_household_id());

-- email_log: login codes are sent before any household exists, so inserts accept NULL;
-- reads stay household-only (settings readouts); no UPDATE/DELETE policy (append-only).
CREATE POLICY email_log_read ON email_log FOR SELECT
  USING (household_id = app_household_id());
CREATE POLICY email_log_insert ON email_log FOR INSERT
  WITH CHECK (household_id IS NULL OR household_id = app_household_id());

-- Account-wide counts (Resend's cap is per account) for the cron budget and the login-code
-- cap. Runs as the owner, returns a number and nothing else.
CREATE FUNCTION email_sends_since(since timestamptz, only_kind text DEFAULT NULL) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT count(*)::int FROM email_log
     WHERE sent_at >= since AND (only_kind IS NULL OR kind = only_kind) $$;
REVOKE EXECUTE ON FUNCTION email_sends_since(timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_sends_since(timestamptz, text) TO lejer_app;
```

The calendar feed (`/cal.ics?k=<token>`) is fetched by calendar apps with no session, so it
needs one more definer function, hardened the same way. Tokens are per **membership**, not
per household: removing a member kills their feed by cascade, and "reset my calendar link"
(`UPDATE memberships SET calendar_token = DEFAULT` for `ctx.membership.id`) rotates one
person's link without touching anyone else's.

```sql
-- 0002 (CREATE EXTENSION pgcrypto for gen_random_bytes; available on Neon PG 17):
-- memberships.calendar_token TEXT NOT NULL UNIQUE
--   DEFAULT rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
CREATE FUNCTION calendar_context(token text)
  RETURNS TABLE (household_id int, membership_id int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT m.household_id, m.id FROM memberships m WHERE m.calendar_token = token $$;
REVOKE EXECUTE ON FUNCTION calendar_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_context(text) TO lejer_app;
```

The route calls it inside `withUser(null)`, then serves the feed inside `withHousehold` for the
returned household. `memberships_read` lets a member see everyone's row in their household,
tokens included; app code selects `calendar_token` only for `ctx.membership.id`.

### Cross-household reads for the operator (0011, decided 2026-10-13)

`/admin` (`app/(app)/admin`, reserved slug) is the operator's page: every household as metadata,
counts and its people, every person with their address and households, totals, the month's and
today's email against the ceilings and by kind, recent failed sends, the last eight weeks of
sign-ups, the launch waitlist, and the last cron tick per household with its outcome; plus
three writes, deleting a user, deleting a household (below) and the operator's note. Since
2026-10-18 it is five sections (`AdminSections.tsx`: Overview, Households, People, Email,
Waitlist; a sticky list beside the content, the open one in the hash) with sortable tables
whose rows open in place, modelled on the Catamount Sublets admin; the earlier page was one
long list of facts. It is for whoever is in
`SUPERADMIN_EMAILS` (`lib/superadmin.ts`); anyone else signed in gets not-found, the same page
as any unknown URL, never a 403, and signed-out visitors are sent to `/login` like everywhere.

The rule for its data: **no new owner-connection call site.** The four `adminSql()` sites stay
four. Instead, the page runs one `withUser` transaction (`lib/admin.ts`) over six
`SECURITY DEFINER` functions hardened like `email_sends_since` and `calendar_context`:
`search_path` pinned, EXECUTE revoked from PUBLIC and granted to `lejer_app` only, `STABLE`,
and each returning aggregates, household metadata or the users list, never a tenant row:

| Function | Returns |
|---|---|
| `admin_households()` | id, name, slug, mode, theme, created, member and joined counts, bill count, last activity, deletion state, reminder bookkeeping, `last_tick_outcome` |
| `admin_totals()` | households, users, joined and pending memberships, bills and unpaid bills, households deleting |
| `admin_weekly(weeks)` | per ISO week (UTC): households created, users created, bills posted, zero-filled |
| `admin_email_kinds(since)` | per kind: sent and failed |
| `admin_email_failures(since, max_rows)` | when, kind, household **name** (never the address, its hash or an id) |
| `admin_users()` (0013) | id, email, name, created; memberships as json (household id, name, slug, role, joined) |

Never: a bill amount, an address's hash, a file path, a calendar token, a code hash. Addresses
themselves are shown (decided 2026-10-13, with the users list: a list of first names is no list;
the privacy page says so). The `admin` verify suite reads the catalog (`prosecdef`, `proconfig`,
`aclexplode`) and
refuses a result column named like one of those; it also calls every function from a pooled
`lejer_app` connection with no GUC and checks the same transaction still sees zero tenant rows
directly, so the functions widen nothing outside themselves. Two locks, as everywhere: the
app's `requireSuperadmin()` decides who may ask, and the functions bound what any asker can
get. A bug in the page exposes counts, not bills.

**Operator accounts are operator-only (decided 2026-10-13).** An address in `SUPERADMIN_EMAILS`
never belongs to a household: `submitCode` sends it to `/admin` (no invite is accepted, whatever
`next=` says), `homePath()` is `/admin`, `requireMemberUser()` turns `/new` and `/households`
away, `requireUser()` turns every household page away, `accept()` in `lib/context.ts` returns
no ctx for it (so opening an invited household never stamps `joined_at`), and `inviteMember` /
`resendInvite` refuse the address with "That address runs the site and can't join a household."
Its pages wear the operator header (wordmark, Admin, Sign out) and a footer of the legal line.
The `http` suite drives all of it with a users-only fixture: sign-in lands on `/admin`, a
pending invite stays unaccepted, `/new` creates nothing, the invite is refused, and a normal
user still opens `/households`. The same address is in Preview's env too, so previews behave
like production.

**The operator's writes (decided 2026-10-13).** Two, both in `lib/admin.ts`, both behind a
disclosure on the page that asks for the record's own key typed back, both refusing with an
`ActionError` the page shows, and neither a new owner-role call site:

- `deleteUserAsOperator(operator, userId, typedEmail)`: each of the person's memberships goes
  the way an admin's removal does (`removeMembership` in `lib/deletion.ts`: their debt rows drop,
  bills they fronted read "former member", a deletion vote they held up settles), one
  `withHousehold` per household under the system scope (`user: null`, as the cron's deletes run),
  then `DELETE FROM users` under `withUser` (`users` has no RLS). A household they were alone in
  stays, empty, flagged "Nobody left in it" on the page for the operator to delete next. Never
  the operator's own account, never an address in `SUPERADMIN_EMAILS`.
- `deleteHouseholdAsOperator(operator, householdId, typedSlug)`: `deleteNow()` in
  `lib/deletion.ts` sets `delete_after = now()` and runs the cron's `hardDelete` (the Blob prefix,
  then the row, everything cascading). Right now, no grace week, no vote, no mail; the members'
  accounts stay. The `admin` suite covers both at library level and `http` drives the two actions
  as the operator (303 → `?ok=`) and as a household admin (404).

**The operator's mail (0016, decided 2026-10-14; the waitlist audience 0018, 2026-10-18).**
`/admin`'s Email section is a compose form (`app/(app)/admin/ComposeForm.tsx`,
`lib/operator-mail.ts`): a note about the service to everyone who has joined a household, to
some households or some people (a pick list unfolds under the choice, in the form; the "Email"
word on a row in Households or People ticks it from there), or to the launch waitlist. Then a
subject, a plain-text body (a blank line starts a paragraph), an optional button (label plus an
https address) and the reply address (the contact address unless changed). "Send me a copy"
posts one copy to the operator, worded for the audience. "Send…" resolves the audience in the
browser with the same rules as the server and asks in the sheet's one `<dialog>`, naming the
count ("Send to 12 people (3 households)? 2 turned updates off", "Send to 40 addresses on the
waitlist?"), then posts `intent=send`; the server resolves it again before anything goes out.
The rules: a person is reachable only with a **joined** membership (an invite-only address is
unproven, the same rule as household mail), never when they run the site, once however many
ticked households they're in, and not when they've turned `updates` off (reported as muted,
not sent). Recipients come from `admin_users()` plus a direct read of `users.muted_kinds` (no
RLS), so there is no new definer function and no new owner-connection call site.

**The waitlist is an audience since 0018 (decided 2026-10-18; until then it was not: no account,
no way to unsubscribe).** The coming-soon page promised "one note when it opens, and nothing
else", and that note has to come from somewhere. So: the audience is every `waitlist` row with
`notified_at IS NULL`; each copy goes out as `waitlist_note` with "Hi there," in place of a
name and a **waitlist-scoped** unsubscribe (§6: token `{ wl, cat }`, "Take me off the
waitlist", a click deletes the row, the only "off" an address with no account can have); a
copy that sends stamps its row `notified_at` at once (a failed one stays waiting), so the note
goes out once per address and a second send finds "everyone told". The Waitlist section lists
who joined when and who has been told, with a copy field and a button into the compose form.
Service updates still: the launch notice is the whole reason.

The mail itself is a third sender class in `lib/mail.ts`: `SITE_KINDS` (`operator_note`,
`waitlist_note`) goes out as `"Lejer" <hello@…>` (the contact address, so replies land where
people already write), honors Reply-To, needs no household, and logs `household_id NULL`.
The template (`emails/OperatorNote.tsx`, redrawn 2026-10-19) reads as a letter: the product's
name once, in the masthead (the From name says it too), no eyebrow, the subject as the heading,
the greeting and body, the optional button, "Reply to this email with any questions", and a footer
of the reply address and the legal line only (`Shell`'s `footer`, the domain, is optional since
then). Until then it stacked "LEJER" over "A NOTE FROM LEJER" over the domain twice. The
note to accounts is mutable, category `updates`, with a **user-scoped** unsubscribe token (§6)
that sets `users.muted_kinds`; the account page has the checkbox ("Email from Lejer"). The
budget is bulk email's: `sendsToday() + recipients > BULK_DAILY_LIMIT` (1,000 since the Pro
plan, §6) refuses, naming the count, so reminders and sign-in codes keep their room; sends go
one at a time, 600 ms apart (Resend's 2 req/s). The privacy page says the operator may email
account holders about the service and how to turn it off.

**Service updates only.** The note is for changes to the service, things that need doing, and
the launch notice. Anything promotional would need a physical postal address in the footer
first (CAN-SPAM), which no template carries; nothing in the code enforces the distinction,
the operator does. The `admin` suite covers the audience rules, the preview, each refusal, the
budget and the waitlist (once per address, the stamp, a failed send left waiting) at library
level, with `sendOperatorNote`'s verify-only `only` filter (like `tick({ only })`) so a run never
stamps a real row on dev; `http` drives the action as a household admin (404) and as the
operator (preview, a household, the refusals), the account checkbox both ways, and the
waitlist's unsubscribe page and one-click POST.

`households.last_tick_outcome` (0011) is one line per tick, stamped by `tickHousehold()` after
its run in a short transaction of its own ("sent 3, 1 failed", "skipped: nothing due",
"deferred: budget", "error: …"); the admin page shows it beside `last_run_at`.

A plain tenant policy on `email_log` would have broken three things: login-code sends
(`household_id NULL`) could not be logged, the global login-code cap could not see any rows,
and the cron budget would count only its own household's sends. Because `RETURNING` must pass
the SELECT policy, `INSERT … RETURNING` of a NULL-household row fails: `sendMail` does not use
`RETURNING`.

Note: with `FOR ALL` plus a more permissive `FOR SELECT` policy, Postgres ORs permissive
policies per command, so reads use the union and writes use only the household branch, which is
the intent. A missing GUC yields NULL on both sides → zero rows, zero writes (fail closed).

`users` and `login_codes` have no RLS: login happens before any household is known, and those
queries are keyed by the email being verified. `withUser` sets only `app.user_id`.

### Roles on Neon

- `neondb_owner` (Neon's default): owns the tables, so RLS (enabled, not forced) does not apply
  to it. (It also has `rolbypassrls = true` on Neon; either is sufficient.) It can also
  disable RLS outright, so the app does not run as this role. Its URL is
  `DATABASE_URL_ADMIN` (unpooled). Allowed call sites, enumerated in `CLAUDE.md`:
  1. `scripts/migrate.ts`
  2. `createHousehold()` (signup: insert household + first admin membership, then return)
  3. the cron tick's household enumeration (`SELECT id, timezone, … FROM households`)
  4. the slug lookup in `scripts/send-reminders.ts` (§8)

  (The one-time import, `scripts/import-tidb.ts`, was a fifth until it ran; it was then removed.)
- `lejer_app`: created **with SQL** as `neondb_owner` on `main` before branching
  (`CREATE ROLE lejer_app LOGIN PASSWORD … NOBYPASSRLS`), not in the console, so it is not a
  member of `neon_superuser`. `0001_init.sql` refuses to run without it, then grants
  `USAGE ON SCHEMA public`, `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`,
  `USAGE ON ALL SEQUENCES`, `ALTER DEFAULT PRIVILEGES` so future tables inherit, and revokes
  `schema_migrations`. Its pooled URL is `DATABASE_URL`.

### Neon connection pooling and RLS

Neon's `-pooler` endpoint is PgBouncer in **transaction mode**: a connection is handed to a
client for one transaction and the next transaction may run on a different server connection.
Consequences baked into the design:

- Session-level `SET` is useless and dangerous (it can leak onto another tenant's transaction).
  Only `set_config(name, value, true)` / `SET LOCAL` inside `BEGIN … COMMIT`.
- `prepare: false` is mandatory; PgBouncer transaction mode cannot track prepared statements.
- Transactions are short: one per request, no awaiting user input inside.
- `LISTEN/NOTIFY`, advisory locks that outlive a transaction, and temp tables are off the table.

### Blob keys and `/files`

Private Blob stores, one per environment class: `lejer-blob` for development and preview,
a separate store for production, created at cutover (decided 2026-10-06; household ids come
from different databases per environment, so a shared store would collide on `h/{id}/`).
Verified against current docs: `@vercel/blob` ≥ 2.3,
`put(path, body, { access: 'private' })`, server-side `get()` returns a stream, store access
mode is fixed at creation). Private means blob URLs are not fetchable without a token, so
`/files` is the only way in and the "public but unguessable URL" argument is retired.

Keys are household-prefixed:

```
h/{household_id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf   deterministic per bill; allowOverwrite: true
h/{household_id}/documents/{slug}-{randomSuffix}.{ext} addRandomSuffix: true
```

`/files/[...path]/route.ts`:

1. The household the key names (`h/{id}/`), through `getCtxForHousehold(id)`: no membership →
   404 (§5 Household URLs; before 2026-10-07 this was the cookie's current household, or 403).
2. Reject unless the key starts with `h/${ctx.household.id}/` (cheap first lock).
3. Inside `withHousehold`, confirm the key exists in `bills.pdf_path` or
   `documents.file_path` (RLS is the second lock: a key from another household returns no row
   even if step 2 were wrong).
4. Extension allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG), `X-Content-Type-Options: nosniff`,
   `Content-Disposition: inline`, `Cache-Control: private, max-age=3600`.
5. `get(key, { access: 'private' })` and stream the body.

The bill id in the key (revised 2026-10-06) keeps two same-type bills posted the same day
apart; with `ask_bill_date` off every bill is dated today, so `{MMDD}` alone would collide.
The type is slugified. The `pdf_path` CHECK pins only the `h/{id}/bills/` prefix, so it needed
no change. `addBill` reserves the bill id (`nextval`) first, uploads under the final key, then
inserts the row, so a bill never points at a missing file.

Bill PDFs upload through the add-bill server action (`experimental.serverActions.bodySizeLimit`
4.4 MB; the action caps the file at 4 MB and checks the `%PDF-` magic bytes; under Vercel's
4.5 MB request cap). Documents upload client-direct via `handleUpload` in `/api/documents/upload`;
`onBeforeGenerateToken` runs `requireAdminAction()` and **refuses** any pathname outside
`h/{id}/documents/` (revised 2026-10-06: `@vercel/blob` binds the client token to the pathname
the browser requested and offers no way to substitute another, so the original plan to rewrite
it was impossible; the page tells the browser its prefix, and the bound token means the upload
cannot land anywhere else); `onUploadCompleted` stays a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting. That
route stays excluded from `proxy.ts` for the same callback reason as today; the OIDC token is
preferred on Vercel, `BLOB_READ_WRITE_TOKEN` is still needed for client-upload token minting
and for the import script.

---

## 5. Identity

- **One email, many households.** `users` is global; `memberships` is per household. Nav shows
  the household name, always a link home. The household's sections (Overview, Bills, Trends,
  Docs, Members, Settings) are the nav's links; the person's own things (switching to another
  household, Account, Your households, Sign out) sit apart in one menu under their name, since
  they leave the household. (Until 2026-10-12 the switcher was a second dropdown hidden in the
  household name, and Members was "Household" with the bill types on it; the navigation
  cleanup moved bill types to Settings as Utilities. DESIGN.md "Page Header and Actions" holds
  the page pattern.) (Until 2026-10-07 the nav read Dashboard · Portal · Trends ·
  Docs · Account, and Portal held Bills · Household · Email · Settings as tabs: "Portal" said
  nothing about what was in it, and Account looked like one more household section.)
- **Login** stays email-code: enter email → 6-digit code (sha256 at rest, 10 min TTL, 5 wrong
  guesses kill it, 30 s burst dedupe) → `lejer_session` JWT `{ uid }`, 30 days, re-issued by
  `proxy.ts` once a week old. Which household a page shows comes from its URL, not the cookie
  (Household URLs, below).
- **Unknown email is not an error anymore.** Anyone can sign up, so the code is sent regardless
  (this also stops login from enumerating members). `login_codes` is keyed by the normalized
  email (citext; `0002` replaced `user_id`, revised 2026-10-06 because a NOT NULL `user_id`
  would have forced a `users` row per code request), so requesting a code writes nothing to
  `users`. Verifying the code creates the `users` row with a placeholder name from the email's
  local part and lands on onboarding, whose first field asks for the real name.
- **Signup = onboarding** after first login: your name, household name, mode (two cards with
  one-line explanations), the utilities the house splits, theme, timezone → `createHousehold()`
  (owner role, one transaction: household + admin membership + the picked utilities) → the
  welcome tour → the overview, which says "Next step: invite your roommates" while the creator
  is the only member. **Utilities in onboarding** (2026-10-13): Gas, Electric, Internet and Water
  (`STARTER_UTILITIES` in `lib/households.ts`), each checked, with its emoji (changeable,
  clearable) and a processing fee defaulting to 0; unchecking all is allowed, and the overview's
  "First step" then points at Settings → Utilities as before. All are owned by the creator, the
  only member: the payer in single-payer mode, and in ledger mode the owner until they reassign
  each in Settings → Utilities once roommates join (the step says so in ledger mode).
- **A utility's emoji is optional** (0012, 2026-10-13). `bill_types.emoji` is nullable, NULL is
  its only spelling of none (a CHECK refuses blank), and every place that shows a utility
  (overview, bills, the add-bill select, Settings, trends, the calendar feed, the tour) prints
  the emoji and a space only when there is one. Emails never carried it. The Settings dialog's
  field starts empty with the hint as placeholder text ("Optional, e.g. ⚡").
- **Invites by email.** An admin enters name + email (+ role, `splits_bills`). This upserts the
  `users` row (name only if new) and inserts a `memberships` row with `joined_at NULL`. Resend
  sends "{Admin} added you to {Household} on Lejer" with a `/login?email=&next=/{slug}` link. The email-code
  login already proves ownership of the address, so there is no invite-token table; signing in
  stamps `joined_at` (and so does opening the household's URL while signed in, in `getCtx()`). "Resend invite"
  re-sends the email. Removing a membership (`removeMembership` in `lib/deletion.ts`, shared with
  leaving) cascades debts and thanks, nulls
  owner/uploader/poster references (same outcome as `removePerson` today). Unlike login,
  invites do create the `users` row up front: an admin vouched for the address.
- **Names belong to their owner.** `users.name` is shared by every household a person is in,
  so admins set it only when inviting someone new to Lejer; afterwards the person edits it on
  `/account`. Admins manage role and `splits_bills`. The last joined admin can't be demoted or
  leave; anyone else can leave ("Deleting a household and leaving", below). Admins remove
  others, never themselves.
- **Roles.** `admin`: settings, members, bill types, every bill, bulk email, documents CRUD.
  `member`: read everything; in ledger mode, post bills and mark payments for types they own.
  Helpers: `requireUser()`, `requireAdmin()`, `requireAdminAction()` keep their names;
  `requireBillManager(tx, typeId)` = admin or owner of that type.
- **Non-splitting members** keep `splits_bills = false`: visible, can sign in, excluded from
  split math, debts, checkbox lists and new-bill emails (`getSplitters()`).
- **Login-code abuse controls** (new; the app is public now):
  - per email: 5 codes per 10 min window, 30 s burst dedupe (as today);
  - per IP: 10 codes per hour (`login_codes.ip_hash` = sha256 of the client IP from
    `x-forwarded-for`'s first hop, never the raw IP);
  - global: 40 code emails per UTC day, counted from `email_log` via `email_sends_since()`; past that the form says
    "try again later" and logs. This reserves ~60% of Resend's 100/day for household mail.
- **Dev bypass.** `APP_DEV_USER=<email>` + `APP_DEV_HOUSEHOLD=<slug>`: every request is signed
  in as that email and `proxy.ts` short-circuits, **only** when `VERCEL_ENV !== "production"`
  (local and preview deployments). The household still comes from the URL (a membership is
  required as usual); `APP_DEV_HOUSEHOLD` is where "Sign in" lands. The passphrase fallback and
  `SITE_OWNER_EMAIL` are deleted.
- **Demo.** The demo is a household URL like any other: `/demo`, `/demo/bills`, … are public,
  and `getCtx()` returns the in-memory ledger-mode household for them (ported `lib/demo.ts`,
  relative dates, neutral names) whoever is asking, signed in or not. Data functions branch on
  `ctx.demo` and mutations return the polite refusal. No env flag and no cookie. (Before
  2026-10-07 it was a `lejer_demo` cookie that took over `/` and needed a "you're signed in"
  notice to avoid confusion with the real household; a URL can't be confused.)

### Launch gate (decided 2026-10-13; lifted 2026-10-22)

**Lifted 2026-10-22**, a day ahead of the announced Friday: `LAUNCH_GATE` was removed from
Production and the site redeployed. The mechanism stays, so the site can be closed again with
the same one env change, and the `http` suite keeps exercising it.

Production goes live closed. `LAUNCH_GATE=on` (Production only; `lib/gate.ts` reads the env on
every call, never at module load) does four things, and unsetting it undoes all four with no
code change:

- `/` renders `app/(site)/ComingSoon.tsx` (the site's look, one calm paragraph, the contact
  address) for everyone, signed in or not. Its heading names launch day (`LAUNCH_DATE` in
  `lib/gate.ts`, 2026-10-23, added 2026-10-19: "Lejer opens Friday, October 23.") until that
  day has passed in US Eastern, then falls back to "almost ready", so a slipped launch never
  shows a stale date; `SiteShell` drops the page links and the demo but
  keeps Sign in / Open your household and the legal line. `proxy.ts` redirects `/about`,
  `/how-it-works` and `/demo…` to `/`; `/login` and `/privacy` stay reachable, and signed-in
  household pages work as usual.
- Every response from the proxy carries `X-Robots-Tag: noindex, nofollow` and `baseMetadata`
  adds the meta tag. `app/robots.ts` still **allows** crawling (changed 2026-10-15, when the
  domain went into Google Search Console): a crawler only sees noindex on a page it may fetch,
  and a `Disallow: /` would leave a linked URL indexable as a bare link. `app/sitemap.ts`
  (dynamic, named in robots.txt) is empty while gated, since a listed noindex URL is a Search
  Console error.
- `requestCode` refuses any address not on `SIGNIN_ALLOWLIST` (comma-separated, normalized;
  empty means nobody) **before** touching `login_codes` or sending, so a refused address costs
  no code and nothing of the Resend budget. The refusal is neutral ("isn't open yet"), the same
  for a known and an unknown address. `submitCode` checks again (a code minted before the gate
  closed), and `inviteMember` / `resendInvite` refuse addresses off the list.
- The `http` suite starts a second `next start` with the gate on and an allowlisted fixture
  address, and checks every item above; the first (open) server checks the header is absent.

### Deleting a household and leaving (0009, decided 2026-10-12)

Before 0009 a household could never be deleted and nobody could leave. `lib/deletion.ts` holds
every rule; actions in `app/(household)/[household]/household/actions.ts` call it and send mail
after commit.

- **Alone.** When the viewer is the household's only *joined* member (pending invites don't
  count), they delete it by typing its name in a dialog at the end of Settings
  (`/household/settings`, "Leave or delete"; it moved there from the Members page on
  2026-10-12 with the navigation cleanup).
- **Otherwise, a vote.** An admin requests deletion (`deletion_requested_at/_by`; the request
  counts as their approval, a `deletion_approvals` row). Every joined member is emailed and
  sees a banner on every page with Approve and Cancel. It's marked once every joined member
  has approved; any one cancel ends it, even from someone who approved; it lapses after 14
  days (`REQUEST_DAYS`; read as gone at once, cleared and emailed by the cron). Voters are
  whoever has joined at each check, so someone who joins mid-vote must approve too, and a
  removal or someone leaving re-checks the vote (`settle`) and can complete it. Every function
  locks the household row first, so two last approvals can't both miss.
- **A week's grace, both ways.** Marked (`delete_after = now() + 7 days`, `GRACE_DAYS`), the
  household is read-only: `readOnlyReason(ctx)` in `lib/auth.ts` refuses every action (it
  replaced each action's `ctx.demo` check, and the `assert*` helpers throw it, so the library is
  covered too; the `deletion` suite fails if an action refuses only the demo), pages hide
  their controls, and the cron sends nothing for it. Any admin can Undo until the day comes;
  after that it's too late, since the cron may be mid-delete.
- **The cron deletes.** The first tick at or after `delete_after` deletes the `h/{id}/` Blob
  prefix, then the household row inside `withHousehold` under a system scope: every table
  cascades, and the cascade runs as the table owner, so no new owner-role call site. A crash
  between the two leaves the row for the next tick. `users` rows stay (people may be in other
  households); `email_log` rows stay with no household (0009 made that FK SET NULL) so the
  day's Resend budget still counts them. The slug is free to reuse afterwards: old links then
  answer not-found, as any slug does for a non-member.
- **Mail** (decided 2026-10-12): requested, marked, cancelled, lapsed and undone, each to every
  joined member except the person who did it (the "marked" confirmation goes to everyone),
  never deferred for the budget. Pending invites get none of it.
- **Records first.** `/{slug}/household/export` is every bill and payment as CSV, one row per
  share (`lib/export.ts`), for any member at any time; the panel, banner and emails point at it.
- **Leaving** is open to anyone but the last joined admin ("make someone else an admin, or
  delete the household"), never while the household is read-only. It removes the membership
  like an admin's removal: their unpaid shares come off the ledger and bills owed to them stay,
  owed to "former member". The confirm dialog names both amounts first (decided 2026-10-12:
  allowed with debts, not blocked). Leaving lands on `/households`.

### Household URLs (decided 2026-10-07)

Lejer flows like any hosted product (gmail.com is the reference the owner gave): the domain
is a public site, you make an account there, then you provision a household, and the household
has its own address.

- **`/` is the public site for everyone**, signed in or not (`app/(site)/page.tsx`). The header
  says "Sign in" to a visitor and "Open your household" (or "Set up your household") to someone
  signed in. Signing out lands back on `/`.
- **Each household lives at `/{slug}`** (`lib/paths.ts`): `/oak-lane` is the overview,
  `/oak-lane/bills`, `/oak-lane/household` (with `/settings` and `/email` under it),
  `/oak-lane/trends`, `/oak-lane/documents`, `/oak-lane/welcome` the rest. The pre-2026-10
  `/{slug}/portal…` paths redirect there (`next.config.ts`, temporary, before `proxy.ts`), since
  emails already sent link to them.
  The slug is made from the name at signup and never changes (renaming keeps it). Pages
  outside any household stay at the top: `/login`, `/new` (onboarding), `/households`,
  `/account`.
- **"Sign in" goes straight to your ledger.** `GET /login` with a session redirects to `next=`
  if given, else `homePath()`: the household opened last (a plain `lejer_household` cookie the
  proxy sets on each household GET; a preference, not a credential), else the first joined,
  else `/new`. After a code: `/new` for a new account, else `next=`, else the newest invite,
  else `homePath()`. The code step skips the redirect, so a signed-in person can still sign in
  as another address from the site's form.
- **The URL picks the household; the membership authorizes it.** `proxy.ts` reads the first
  path segment, drops any client-sent `x-household` header and sets its own; `getCtx()` looks
  the slug up under `withUser` (RLS shows only the viewer's households) and returns `null`
  without a membership. `requireUser()` then answers not-found to a signed-in non-member, so a
  slug never confirms a household exists. Server actions post to the page's URL, so they get
  the same household. One session can have two households open in two tabs.
- **Routes with no slug in the URL** resolve the household from what they name: `/files/h/{id}/…`
  and the document-upload handshake use the key's `h/{id}/` through `getCtxForHousehold(id)`
  (membership required; every refusal past sign-in is a 404). `/account` lists a calendar link
  per joined household and resets one by id.
- **Reserved slugs.** Every top-level route name, Next's metadata routes, the pre-URL paths
  (`portal`, `trends`, …) and names a public site grows into (`pricing`, `blog`, `help`, …) are
  in `RESERVED_SLUGS`; `createHousehold()` starts such a name at `-2`. The identity suite fails
  if a top-level route isn't reserved or a household holds a reserved slug. Adding a top-level
  route means reserving its name first; a household that already has it must be renamed by
  hand.
- **Three root layouts.** The theme sits on `<html>`, and Next keeps a shared root layout across
  client navigations, so household pages have their own root at
  `app/(household)/[household]/layout.tsx` (re-rendered whenever the slug changes) and the
  account pages theirs at `app/(app)/layout.tsx`; both render `app/components/AppShell.tsx`.
  The site is the third, and `/login` is on it: most sign-ins start at the home page's form,
  so the code step continues that page's look rather than switching to a household theme
  (which can't be known before sign-in anyway; signing out clears the household cookie). Crossing between roots is a full page load.
- **Links carry the household.** Nav, tabs, pagination, redirects and `done()`/`fail()` paths go
  through `householdPath(h, path)`; every household email links to `appUrl(/{slug}…)` and the
  calendar feed's URL field to the household, so a link from one household never opens another
  (with the old cookie, an oak-lane email opened whichever household you were last in).

---

## 6. Email

- **Resend** replaces nodemailer. The account is set up directly at resend.com (not the
  Vercel marketplace); Aaron owns the `RESEND_API_KEY` and the DNS. Mail sends from the
  root domain `uselejer.com`, no `mail.` subdomain: Resend's records are DKIM on
  `resend._domainkey.uselejer.com` and the return path (MX + SPF) on its `send.` subdomain, plus
  a DMARC record on `uselejer.com`, so the root's own MX stays free for a future inbox. Since 2026-10-12 preview
  and production have the key and send real mail from `uselejer.com`; development does not
  (removed the same day, so local work never spends the shared quota: console mail
  unless the key is put in `.env.local` by hand to test delivery); `RESEND_TEST_SENDER` (Resend's `onboarding@resend.dev`, which delivers only
  to the account owner's address) is set nowhere. With `RESEND_API_KEY` empty outside production,
  `sendMail()` prints each message with a `[mail:console]` prefix and writes no `email_log` row;
  production refuses to boot without the key (`instrumentation.ts`), so codes never reach logs. Senders: `login@uselejer.com` for codes and
  invites (From "Lejer", no Reply-To) and `notify@uselejer.com` for everything household-scoped.
- **Per-household From and Reply-To.** From is
  `"{households.from_name ?? households.name} via Lejer" <notify@uselejer.com>`; the display
  name is where the household identity lives since the address must stay on our domain.
  Reply-To defaults to `households.reply_to` (seeded with the creating admin's email). Reminder
  and new-bill emails override Reply-To with the **bill owner's** email so "reply to settle up"
  reaches the person being paid.
- **React Email** (`@react-email/components` + `render`): templates are components, previewed
  with `npm run email:dev`. A `<Shell theme>` carries the two existing shells (statement: mono
  eyebrows, ruled tables, grey page; peach: awning stripe masthead, Georgia, Courier) chosen by
  `households.theme`, same inline-style, light-only, 560 px discipline as today. Templates:
  login code (+ plain-text alternative), invite, new bill (owner-aware: debtors told who to pay,
  owner told who owes; sent 10 minutes after posting, with a "Corrected" variant for edits, §3),
  bill removed, reminder (heads-up/urgent), payment thanks (multi-bill), custom note,
  reminder batch confirmation, bulk-email receipt, and a digest copy (what a new-bill,
  corrected, removed or per-bill reminder email told whom) for `digest_email`. Copy is
  gender-neutral.
- `sendMail()` returns `false` on failure (logged, never thrown) as today, and writes an
  `email_log` row either way. Reminder batches use `resend.batch.send` (≤ 100 per call),
  replacing the 1 s SMTP sleep.
- **Daily ceilings.** `email_log` is the source of truth for "sends today" (UTC), read
  account-wide through `email_sends_since()` (§4). Resend is on **Pro since 2026-10-18**
  (50,000 a month, no daily cap), so the ceilings in `lib/mail-limits.ts` are the app's own
  safety valves, sized to a day's share of the month with room to spare, so a runaway bug (a
  reminder loop, a stuck queue) stops well short of the quota: `EMAIL_DAILY_CEILING` 1,500,
  `CRON_DAILY_LIMIT` 1,200, `BULK_DAILY_LIMIT` 1,000, `LOGIN_DAILY_LIMIT` 300 (until then 100 a
  day was Resend's free tier, and the numbers were 80, 60 and 40). Before a household's
  reminder batch, the cron computes `sentToday + batchSize`; if it would exceed
  `CRON_DAILY_LIMIT`, it defers that household (no `last_send_date` stamp, so the next hour
  retries; if the day never clears, tomorrow's window sends), logs `deferred: budget` in the
  tick response, and continues with the next household. Login codes, invites and thanks are
  never deferred. The admin page shows the month against the plan's 50,000 and today's count.
- **Bulk email has a lower ceiling (decided 2026-10-07).** It is optional and reminders aren't, so
  `/household/email` (and the operator's note) refuses when today's account-wide sends plus its
  recipients (and the receipt) would pass `BULK_DAILY_LIMIT`, leaving headroom for the reminder
  batch and login codes. The refusal names the next UTC midnight in the household's timezone as
  the time to try again.
- **Digest copies.** When `digest_email` is set it gets the batch confirmation, the bulk-email
  receipt, and a copy for each new bill and each per-bill reminder. Every copy is one more send
  against the budget, which is why it defaults to empty.

---

### Deliverability and unsubscribe (0014, decided 2026-10-13)

Every message is sent as HTML plus the plain-text rendering of the same React Email template
(`render(el, { plainText: true })`, login codes included), and every footer ends with the sender's
identity, "Lejer · Aaron Perkel LLC" (`SENDER_IDENTITY`), after the domain and reply address.
No images, no link text that looks like a URL, no all-caps subjects (the `emails` suite checks
each template's HTML and text for all of this). Click and open tracking are off for the domain
at Resend (a dashboard setting: nothing in the app rewrites links).

**Unsubscribe.** Mail that isn't transactional carries `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) plus a footer link, all pointing
at `/api/unsubscribe?k=<token>`. The token (`lib/unsubscribe.ts`) is a jose HS256 JWT under
`SESSION_SECRET`, audience `unsubscribe`, payload `{ hid, mid, cat }`, never expiring: a removed
membership takes its links with it, and someone must be able to act on an old email. One token
turns off one **category** for one member: `reminders` (the cron's and the per-bill button),
`notices` (new, corrected, removed), `thanks` (payment receipts), `notes` (admins' bulk email),
kept in `memberships.muted_kinds TEXT[]`. Digest copies (`digest`, `batch_confirmation`,
`bulk_receipt`) go to `households.digest_email` rather than a member, so their token clears that
address. Login codes, invites, deletion mail and the "moved" notice are transactional: no header,
no link, never muted (`CATEGORY_OF` has no entry for them).

One category is addressed to the person rather than to a member of some household: `updates`,
the operator's notes about the service (`operator_note`, 0016, §4 "The operator's mail"). Its
token is `{ uid, cat }`; a click sets `users.muted_kinds` (no RLS, under `withUser(null)` like
the login-code lookups), `/unsubscribe` names the product as the source, and the account page
has one checkbox for it above the per-household ones (`updateSiteMailPrefs`). `readUnsubscribe`
accepts either shape and never a household token carrying the user category or the reverse.
A third shape (0018) is addressed to an address with no account at all: `waitlist`, the launch
note to the coming-soon page's list (§4 "The operator's mail"). Its token is `{ wl, cat }`, the
footer says "Take me off the waitlist", a click (page or one-click) deletes the `waitlist`
row, and the page then says the address is off the list; `describeUnsubscribe` never returns
null for it (a row already gone is "already off"), since there is no account page to send
anyone to.

A POST to the endpoint with the one-click body turns the category off at once and answers 200,
idempotently; a GET (a person clicking the footer) is sent to `/unsubscribe`, which names the
household and the kind and changes nothing until its button is pressed, so prefetchers and
security scanners can't unsubscribe anyone. Both URLs are public in `proxy.ts` and `unsubscribe`
is a reserved slug. The account page lists the four categories per joined household as
checkboxes (`updateMailPrefs`), the way back on.

Muting stops mail at the source: every recipient query filters `NOT (category =
ANY(m.muted_kinds))` (`dueReminders`, `remindBill`, `people()` in notices, the thanks claim,
`bulkRecipients`, which also names the muted so the bulk page can say so). `sendMail` refuses a
mutable kind sent without its `unsubscribe` scope (and the verify recorder refuses the same), so
no send site can forget; it injects the link into the template's root element (`cloneElement`) and
the headers into the Resend call, so templates only pass the prop through to the Shell. The
`mail` suite covers the token, each filter and the guard; `http` drives the page, the one-click
POST and the account checkboxes. `npm run mail:test -- <address>` sends one of every template to
an address for a deliverability check (mail-tester.com).

## 7. Per-household settings (`/household/settings`)

| Group | Settings |
|---|---|
| Household | name, tagline (shown in the nav from `md`; the email masthead doesn't carry it yet), slug (read-only after creation), **mode** switch (§3) |
| Features | `feature_rent` (the monthly rent event in the calendar feed, and the rent fields), `feature_trends`, `feature_bulk_email`, `feature_documents`, `feature_welcome_tour`, `feature_thanks`, `feature_owner_checkoff` (§3 "The payer's own check-off"; flipping it recomputes every bill's status) |
| Look | `theme` (statement / peach, with preview), `color_scheme` (statement: system / light; peach: light only) |
| Bills | `ask_bill_date`, `bills_per_page` |
| Reminders | `reminders_enabled`, `send_hour` (in the household's timezone), `first_reminder_days`, `urgent_reminder_days`, read-only "last tick / last send" from the cron columns |
| Time | `timezone` (IANA select; also drives `bill_date` auto-stamping and day math) |
| Email | `from_name`, `reply_to`, `digest_email` |
| Rent | `monthly_rent`, `lease_start`, `lease_end` (shown when `feature_rent`) |

After the form come Utilities (the bill types and their owners; each saves on its own through
the Dialog, so it can't sit inside the form) and Leave or delete (§5), which members can use too.

Disabled features disappear from nav, footer, the Members page's email button and the iCal feed, and their
routes answer not-found (`lib/features.ts`: `requireFeature` for pages, `assertFeature` for
actions, `navLinks` for the header). The calendar feed itself is not a feature: every member
always has one (decided 2026-10-07); `feature_rent` only adds the rent event to it. Themes are
`<html data-theme="peach|japandi|sheet">` with per-theme token blocks in `globals.css` (`:root` =
statement; `[data-theme="peach"]`, `[data-theme="japandi"]` and `[data-theme="sheet"]` override;
sheet is the public site's drafting sheet worn by a household, and the default for a new one
since 2026-10-12: `DEFAULT_THEME` in `lib/theme.ts`, the column default in 0008, and the first
choice card). The household `template.tsx`
renders `ThemeSync`, which rewrites the `<html>` attributes after a client navigation, since the
root layout only renders them on a full load. In Settings the Look group saves on its own
(`saveLookAction` → `saveLook`): picking a card paints `<html>` client-side at once and saves,
with no scrolling to the form's Save; a refused save paints the last saved look back. The statement dark
block is gated on `[data-color-scheme="system"][data-theme="statement"]`, so the two light-only
themes can never reach it. All eight faces load via `next/font`, and preload follows the default
theme: only sheet's Martian Mono preloads (2026-10-12; it was statement's IBM Plex Mono while
statement was the default), so a household only downloads what its theme uses: IBM Plex Mono, Fraunces,
Karla, Courier Prime, Archivo and Martian Mono from Google (the last two declared once in `app/site-fonts.ts`, which the site's roots import too, so the build emits one file each), and japandi's Zen Kaku Gothic New and M PLUS 1 Code as
self-hosted latin subsets in `app/fonts/` (Google slices those Japanese faces into hundreds of
files; `app/fonts/README.md`).

---

### Phase 5 decisions (2026-10-07)

- **Mode switch.** Saving `single_payer` always bulk-sets every type's owner to the chosen payer,
  so the same control changes the payer while staying in single-payer mode. `ledger` only
  changes the mode. Bills keep their `owner_id` in both directions (§3). Saving a change of mode
  or payer goes through the confirm dialog.
- **Chart colors.** Trends uses data-only series tokens (`--series-1..5` per theme and for
  statement dark, in `lib/theme-tokens.ts`), validated for colorblind separation, with no
  status hues. A sixth type onward folds into "Other". See DESIGN.md, Colors > Data series.
- **Calendar feed.** One all-day event per bill, worded for the token's owner, with stable UIDs
  (`bill-{id}@{domain}`), plus the rent RRULE. `Cache-Control: private, max-age=3600` (never a
  shared cache, so a reset link dies at once) and refresh hints of 6 hours, because every
  fetch wakes Neon. Bad, reset and removed tokens all get the same empty 404.
- **Welcome tour.** The household's creator is sent there straight from `/new` (revised
  2026-10-13); finishing or skipping it opens the overview. Everyone else is offered it, never
  forced (2026-10-13): a member whose `welcomed_at` is NULL lands
  wherever they were going (an email link, an invite, the overview), and while the tour is on and
  the household writable the overview shows a banner, "New to {household}? Take the 30-second
  tour →", with Dismiss. Finishing the tour, skipping it or dismissing the banner stamps
  `welcomed_at`; the footer's "How this works" brings the tour back. Until then the overview
  redirected first-timers to `/welcome`, which hid what an email had sent them to see. The tour
  is on for a new household (0010 makes it the column default; existing households keep their
  choice), and `createHousehold()` leaves the creator's `welcomed_at` NULL, so a creator who
  leaves the tour without finishing it is still offered it on the overview.
- **Icons.** `app/icon.tsx`, `app/apple-icon.tsx` and `app/opengraph-image.tsx` render with
  `next/og` at build time from `BRAND` and the theme tokens. There is no logo, so the icon is a
  typographic stand-in (the name's initial over a double rule) until the final brand. The
  create-next-app `favicon.ico` is gone.

## 8. Cron

**One endpoint** `GET /api/cron/tick`, bearer `CRON_SECRET` (timing-safe compare; 500 when the
server has no secret, 401 for a missing or wrong header), `maxDuration = 120`:

1. Owner-role query: `SELECT id … FROM households` (the enumeration call site).
2. For each household, with a system scope (`user: null`) and **short** transactions only (reads
   and stamps, never a send inside one, per the pooling rules):
   - stamp `last_run_at`;
   - deletion before anything else (§5 "Deleting a household and leaving"): a household marked
     for deletion whose day has come is deleted (Blob prefix, then the row) and reported
     `deleted`; one still in its week is `skipped: marked for deletion` and nothing else runs (its
     queues wait, so an undo resumes them); an open request past 14 days is cleared
     (compare-and-set), reported `expired`, and every joined member is emailed;
   - flush the thanks queue if `feature_thanks` (own 10-minute debounce, every tick; payment
     edits also flush through `after()`, as utilities did, so a receipt doesn't wait for the
     next tick);
   - flush the new-bill email queue (`lib/notices.ts`, §3 "Fixing a posted bill"), every tick;
     like thanks, it is never deferred for the budget;
   - compute local hour and date with `localHour(tz)` / `localDate(tz)`;
   - if `reminders_enabled && hour >= send_hour`, **claim the day**:
     `UPDATE households SET last_send_date = today WHERE id = … AND (last_send_date IS NULL OR
     last_send_date < today) RETURNING` the previous value. No row back means another tick (or an
     earlier, later-timezone day) already has it. `<` rather than `!=` means a household that
     moves to a timezone where it is still yesterday can't send twice, and the atomic claim means
     curl's retry of a slow tick can't either (decided 2026-10-07);
   - with the day claimed, check the daily budget (§6) for the batch plus its confirmation copy.
     Over budget → **release** the claim and report `deferred: budget`;
   - send. If every send failed, **release** the claim. A release is a compare-and-set,
     `SET last_send_date = <previous> WHERE last_send_date = <the date this tick claimed>`, so a
     slow failing tick can never clobber a later tick's successful claim. Any success, or nothing
     due, keeps the stamp and records `last_sent_at` / `last_sent_count`.
3. Respond with a per-household summary (`sent`, `failed`, `skipped`, `deferred`); 500 only if
   every household that tried to send failed, so the Actions run goes red.

**What gets a reminder** (decided 2026-10-07). For each unpaid debt row (`paid_at IS NULL`) of a
joined member, with `days` = due date minus the household's today:
- `days = first_reminder_days`: the heads-up;
- `0 ≤ days ≤ urgent_reminder_days`: urgent, daily, up to and including the due date;
- overdue: urgent on overdue days 1, 4, 7, … (`OVERDUE_EVERY_DAYS = 3` in `lib/reminders.ts`, a
  constant, not a setting).
With `feature_owner_checkoff` on (0017), the owner of a bill whose `owner_paid_at` is NULL gets
a `provider` reminder on the same cadence ("Due soon: the Gas bill": the total, no "Pay to",
Reply-To the household's default), one per bill, next to the debtors' `share` reminders.
Utilities reminded daily forever once overdue. That contradicted the product principle "never
make someone feel nagged", so Lejer slows to every third day once a bill is late; the per-bill
button on the bills page is still there for a nudge in between. A day with no tick at or after the
send hour skips that day's reminders (the heads-up included); missing every run in a local day
is rare enough to accept.

**Scheduler** (revised 2026-10-12). A **Vercel Cron Job** in `vercel.ts`:
`crons: [{ path: "/api/cron/tick", schedule: "7 * * * *" }]`. The project lives on the Aaron
Perkel LLC team, on the **Pro** plan, whose crons run as often as every minute with per-minute
precision (checked 2026-10-12 against Vercel's cron docs and `vercel teams ls`). Vercel sends
`Authorization: Bearer $CRON_SECRET` when the project has `CRON_SECRET` set, which is exactly
what the route checks, and crons run only on **Production** deployments: previews never tick the
dev data, and the tick starts by itself with the first production deploy. The "first tick at or
after send_hour, once per local day" rule tolerates a missed run. If the project ever moved back
to Hobby, sub-daily crons would fail the deployment (Hobby runs crons once a day, ±59 min);
an external hourly ping (cron-job.org) would then be the replacement, since the endpoint doesn't
care who calls it.

Until 2026-10-12 the scheduler was a GitHub Actions workflow (`.github/workflows/tick.yml`,
committed inactive until a `TICK_URL` repo variable was set), chosen while the project was on
Hobby. It was deleted before it ever ran: the move to Pro removed the reason for it, and the repo
was private then, so its ~720 runs a month would have billed against the org's Actions minutes.

`scripts/send-reminders.ts` remains the manual CLI and takes
`--household <slug>`. It is the **fifth** owner-role call site (decided 2026-10-07): it uses
`adminSql` only to resolve the slug to an id, then runs the same per-household tick under a
system scope. It ignores `send_hour` but honors the day claim and the budget unless `--force`.

---

Every tick ends by stamping `households.last_tick_outcome` (0011, `tickSummary()` in
`lib/cron.ts`), including an error, so `/admin` shows the last run and how it went without a
trip to Vercel's logs. The stamp is its own short transaction and never fails the tick.

### Wake-ups (decided 2026-10-22)

The two queues hold mail for a ten-minute window, and until 2026-10-22 only the hourly tick and
other bill actions in the same household flushed them, so a bill posted in a quiet household
was emailed anywhere from 10 to about 70 minutes later (the UI had promised ten). The real case:
a bill posted in one of the imported households at 10 PM, emailed at 11:07. A faster cron is out (§10: Neon's
CU-hours), so instead each household gets a **delayed nudge**:

- `lib/wake.ts` `scheduleFlush(householdId)`: a bill action's `after()` (post, edit, delete,
  payment) flushes both queues as before and, if either still reports something `pending`,
  publishes one **Vercel Queues** message on the topic `flush-queues` with
  `delaySeconds = max(NOTICE_DELAY_MINUTES, THANKS_DELAY_MINUTES) * 60 + 60`, an hour's
  retention and the idempotency key `h{id}:{minute}`: several posts inside one minute collapse
  into one message, and the extra minute means it still lands after the last of them has
  waited its full window. The payload is only the household id; the flush decides what's due.
- `app/api/queues/flush/route.ts` is the consumer (`handleCallback`), registered as a
  `queue/v2beta` trigger on that file in `vercel.ts` (`maxDeliveries: 3`). It runs
  `flushHousehold()` in `lib/cron.ts`, the same per-household step the tick runs (receipts,
  then bill emails, under a system scope; a household marked for deletion is skipped). It stamps
  nothing: `last_tick_outcome` is the tick's line.
- **Why Queues** (vercel.com/docs/queues, /concepts, /sdk, /pricing, read 2026-10-22): a delayed
  message is one call; push consumers have **no public URL** (only Vercel's queue infrastructure
  invokes them, so the route carries no secret, though `proxy.ts` must list `/api/queues` as
  public for the request to reach it, and the handler is idempotent on the real clock, so a
  stray request could do no more than wake Neon); messages are **pinned to the deployment that
  published them**, so a production deploy inside the window is handled by the old deployment,
  and a deleted deployment's message is simply lost, which the tick covers; it is in beta on all
  plans and billed per operation (a handful per bill). Workflow's `sleep("10m")` would do the
  same with more machinery; a sleeping `after()` would hold a function instance for the window.
- **Off Vercel it is a no-op** (`process.env.VERCEL !== "1"`): local dev and `verify` never
  publish, even with `vercel env pull`'s OIDC token in `.env.local` (the SDK pins to
  `VERCEL_DEPLOYMENT_ID` and has none), and the `http` suite's server unsets `VERCEL`. Previews
  publish and consume their own messages, so a bill posted on a preview is emailed from the dev
  data ten minutes later, as a preview's `after()` flush already could.
- **Failure is never the action's.** `scheduleFlush` catches everything and returns
  `"failed"` (logged); a message that keeps failing is acknowledged after three deliveries. In
  every such case the next tick sends the email, at most an hour late, and stamps any
  persistent error where `/admin` shows it.

## 9. Dropped or rethought

| Thing | Fate |
|---|---|
| `/api/unpaid` public JSON API (`API_KEY`, `HMAC_KEY`) | Dropped. If a widget needs it later, a per-household read token on `households` is the shape. |
| Passphrase login (`SITE_PASSPHRASE`, `SITE_OWNER_EMAIL`) | Dropped. Preview deployments use the dev bypass. |
| `APP_LOCAL_DEV_USER` | `APP_DEV_USER` + `APP_DEV_HOUSEHOLD`, gated on `VERCEL_ENV`. |
| `APP_DEMO_MODE` / per-deployment demo | Gone. `/demo` route on the real deployment. |
| `/email → /portal/email` 301 | Dropped. |
| iCloud SMTP vars, `APP_EMAIL_FROM_*`, `APP_CONFIRMATION_EMAIL_TO`, `APP_BASE_URL` | Replaced by `RESEND_API_KEY`, `households.from_name/reply_to/digest_email`, and `NEXT_PUBLIC_APP_URL`. |
| `rent_config`, `reminder_config` tables | Columns on `households`. |
| Footer phone number | Dropped; footer shows the household's `reply_to`. |

---

## 10. Free-tier limits (checked 2026-10)

| Service | Free limits | First thing we'd hit |
|---|---|---|
| **Vercel Hobby** | 4 h active CPU, 1 M invocations, 360 GB-h memory, 100 GB fast transfer / month; crons once per day; one seat; non-commercial use only | Moot since 2026-10-12: the project is on the Aaron Perkel LLC **Pro** team (crons every minute, commercial use), which is what lets the hourly tick be a Vercel Cron Job (§8). Compute is nowhere near; one Blob-backed PDF stream per view is the heaviest path. |
| **Neon Free** | 0.5 GB storage, 100 CU-hours / month, autosuspend after 5 min, up to 2 CU, 5 GB egress | **CU-hours** if anything pings more often than hourly: the hourly tick keeps compute awake ~5–6 min per hour at 0.25 CU ≈ 18 CU-h / month; interactive use adds little. Never schedule minute-level pings. Expect a 0.5–1 s cold start on the first request after idle. |
| **Vercel Queues** (beta, per operation, regional pricing; Pro is usage-based) | No free tier on Pro to speak of; each wake-up (§8) is a send, a notify, a receive and a delete, five or so operations per bill posted | Nothing: a household posts a few bills a month. The hourly tick is still the fallback, so a Queues outage costs minutes, not mail. |
| **Vercel Blob (Hobby)** | 1 GB storage (pooled with other Hobby usage), modest operation counts; exceeding locks Blob for 30 days | Years away: ~300 KB per bill PDF → ~3,000 PDFs. Documents (25 MB cap each) are the only way to burn it quickly. |
| **Resend Pro** (since 2026-10-18; Free was 3,000 / month and **100 / day**) | 50,000 / month, no daily cap, 2 requests / second | Nothing a real month does. The app keeps its own daily ceilings (`lib/mail-limits.ts`: 1,500, with the cron at 1,200, bulk and operator mail at 1,000, sign-in codes at 300) as safety valves against a runaway bug, and the admin page shows the month against the 50,000. The 2 req/s rate limit is why operator sends are paced 600 ms apart. |

---

## 11. Phased plan

Each phase ends with `npm run build` green (the typecheck gate, as in both source repos).

**Phase 1 — Scaffold and data layer.** `create-next-app` (Next 16, TypeScript, Tailwind v4,
App Router, Turbopack), `vercel.ts`, `.env.example`. Neon is created **directly** (`neonctl`,
org Aaron Perkel LLC, `aws-us-east-1`), not through the Vercel marketplace: the integration
owns `DATABASE_URL` and points it at the owner's pooled URL, which would run the app past RLS.
Blob (private store) via `vercel blob create-store` on the linked project; Resend directly at
resend.com (revised 2026-10-06, see §6); dev values live in Vercel's Development environment
for `vercel env pull`. `lib/db.ts`
(postgres.js, type parsers, `withHousehold`, `withUser`, `adminSql`), `db/migrations/0001_init.sql`
(schema, FKs, composite FKs, RLS functions and policies, roles and grants), `scripts/migrate.ts`,
`db/seed.sql` (one household per mode, two users). Placeholder page that renders a seeded
household through `withHousehold`.

**Phase 2 — Identity.** `proxy.ts` (session check, sliding renewal, dev bypass, exclusions),
`lib/session.ts`, `lib/login-codes.ts` (user_id, ip_hash, caps), `/login`, Resend client and the
login-code + invite templates with the `<Shell>`, onboarding wizard + `createHousehold()`,
members page with invites, roles helpers, `/households` switcher, `/demo`, `email_log`.
`db/migrations/0002_*.sql`: `memberships.calendar_token` + `calendar_context()` (§4) and
`ask_bill_date DEFAULT false`, plus the "reset my calendar link" action (the feed itself
ships in phase 5).

**Phase 3 — Core ledger.** `0003` (permanent debt rows, §3), bill types with owners
(mode-aware form), add bill (`ask_bill_date`, optional PDF → private Blob), payment checkboxes
(`setPaid`, thanks queue hooks), per-bill reminder, the new-bill and reminder templates (moved
up from phase 4 because phase 3 sends them), dashboard (mode-aware summary strip, owed pairs,
year groups), portal bills + household tabs, `/files`, documents (client-direct upload, list,
edit, remove). Port the zero-diff components (`DueChip`, `Pagination`, `SubmitButton`,
`PaymentCheckboxes`, loading skeletons). `RemindersSection` (the reminder schedule form) moves
to phase 4 with the settings it edits. Verify suites `bills` and `http`.

**Phase 4 — Email, reminders, cron.** Remaining templates (thanks, custom, batch confirmation,
bulk receipt, digest copy), `RemindersSection`, `lib/reminders.ts` per household with timezone, thanks
flush, bulk email tab, `/api/cron/tick` with the budget rule, `.github/workflows/tick.yml` (replaced by a Vercel Cron Job
2026-10-12, §8),
`scripts/send-reminders.ts`, settings page groups for reminders, timezone and email (feature
toggles, look, bills and rent stay phase 5). Verify suite `cron`.

**Phase 5 — Features and themes.** (Done 2026-10-07.) Trends over all types (CSV too), rent + `/cal.ics?k=`
(per-membership token via `calendar_context()`; RRULE when `feature_rent`), welcome tour behind `feature_welcome_tour`, both theme token
blocks + dark mode for statement, OG and apple icons via `next/og`, the rest of the settings
page, nav/footer gating.

**Phase 5.5 — Fixing a posted bill, critique fixes.** (Done 2026-10-07.) `0005`: the new-bill
email queue, edit and delete until someone has paid over the frozen split set (§3), the net
house ledger, and the 2026-10-07 critique's P2/P3s (status vocabulary, household-calendar due
chips, one native dialog, the settings save bar). Verify suite `edits`.

**Phase 6 — Import and cutover.**
Prerequisites: each legacy app's `DB_*` and `BLOB_READ_WRITE_TOKEN`, from its own environment.
Put them in `.env.import.local` as `SRC_UTIL_DB_*`, `SRC_UTIL_BLOB_TOKEN`, `SRC_PC_DB_*`,
`SRC_PC_BLOB_TOKEN`.

`scripts/import-tidb.ts` (owner role, `DATABASE_URL_ADMIN`; removed after the run below.
`scripts/import/` keeps its read, transform and apply steps, which the `import` verify suite
still exercises):
1. Read both TiDB databases with mysql2 (`dateStrings`, `decimalNumbers`), like
   utilities' own TiDB migration script.
2. `users`: dedupe by lowercased email (Aaron appears in both → one user, two memberships).
3. The **first household**, from utilities (`mode = single_payer`, theme statement, `color_scheme`
   system, `ask_bill_date` on, rent/trends/bulk/documents/thanks on, tour off): people →
   memberships with existing admin flags; all types owned by Aaron's membership; bills and
   debts copied **minus Aaron's own debt rows**; `rent_config` and `reminder_config` →
   household columns; documents copied.
4. The **second household**, from the peach app (`mode = ledger`, theme peach, `ask_bill_date` off, tour and
   thanks on, rent/trends/bulk/documents off): people → memberships (everyone admin, Aaron
   `splits_bills = false`), `welcomed_at` carried, owners mapped, `added_by_id` mapped, debts
   copied as-is.
   **Bill owners, both households (0004):** each imported bill's `owner_id` is set from its
   type's owner **at import time** (`had_owner` accordingly). The old apps never recorded a
   per-bill owner, so for any type whose owner changed in the past, older bills get the
   current owner; there is no better record.
   **Debt rows, both households (0003):** the old apps deleted a row when someone paid, so the
   source data holds only *unpaid* rows. Copy those with `paid_at NULL`. Then, for every bill,
   **synthesize** a row for each splitter (as of import) who is not the type's owner and has
   no row: those people already paid. Their `paid_at` is the bill's `due_date` at 12:00 in the
   household's timezone. That timestamp is **synthetic** (the real payment time was never
   recorded) and should be read as "paid by around the due date", nothing more. Finally set
   every bill's `status` from its rows (`refreshBillStatus`), and print how many rows were
   copied, synthesized and dropped (self-debts) and how many bills flipped to `paid`.
5. Blobs: `list()` each old (public) store, fetch each blob, `put()` into the **production**
   private store (the import's `BLOB_READ_WRITE_TOKEN` must be the production store's, never
   lejer-blob's) under `h/{id}/…`, rewrite `pdf_path` / `file_path`. Idempotent (`allowOverwrite`).
6. Verification block per household: row counts, `SUM(total)`, unpaid count, unpaid debt
   rows (= source rows minus dropped self-debts), synthesized paid rows, blob count vs. rows with paths. Non-zero exit on
   mismatch. `--force` deletes the two households (cascades) and their blob prefixes first.
   **Ran 2026-10-14** against `main` (`npm run import-tidb -- --target main`, after a
   rolled-back `--dry-run` of both houses; one owner transaction, then the file copy). The
   first household: 2 members, 4 types, 15 bills, 0 open;
   4 self-debt rows dropped, 15 paid rows synthesized, 4 bills flipped to paid (every open row
   was the payer's own; the roommate had settled), 15 PDFs + 3 documents copied into
   lejer-blob-prod. The second household:
   6 members (4 admins who split, 2 who don't), 4 types, 8 bills, 5 open; 9 open rows
   copied, 15 paid rows synthesized, no files. Aaron is a member of the first household only. Both old
   sites were frozen to a static "Moved to Lejer" page (routes, middleware and reminder
   workflows removed) before the dry run, and became 308 redirects to the households' URLs
   after the smoke test. Their TiDB databases stay read-only until 2026-11-14, then go.
7. Cutover checklist (**done 2026-10-13**, except the DMARC record and launch day; the TiDB
   import followed on 2026-10-14, above; smoke-tested the same day: sign-in by email as
   a normal account, household created, a bill posted with its PDF, the operator landing on
   `/admin` with the counts, a non-allowlisted address refused):
   - **Create the production Blob store** (`vercel blob create-store <name> --access private
     --region iad1 -e production`): its own store, never lejer-blob, which stays dev/preview
     only. Confirm Production's `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` point at it and
     that lejer-blob is not connected to Production.
   - Set the remaining Production env vars (CLAUDE.md, Deployment), set or reset `lejer_app`'s
     password on `main`, run `npm run migrate` against `main`. `main` has **no tables yet**, so
     this applies **every** migration, 0001 through the latest (0007 today); confirm
     `schema_migrations` on `main` lists them all before the import.
   - Dry-run the import against a Neon branch (with a throwaway store), then production.
   - Point the Vercel production branch back at `main` (it's parked on a nonexistent
     `production` branch until then, so pushes only build previews).
   - The hourly tick needs no step of its own: it's a Vercel Cron Job (§8) that runs only on
     Production deployments. Confirm Production has `CRON_SECRET` (the route answers 500
     without it), then after the first production deploy check the project's Cron Jobs tab
     lists `/api/cron/tick` and its first run returned 200.
   - DNS for uselejer.com (the production domain on the Vercel project); disable the two old
     apps' GitHub Actions workflows (utilities, peach); old domains redirect to uselejer.com; TiDB left read-only for a
     month.
   - Resend: verify `uselejer.com` itself (not a `mail.` subdomain). Add only Resend's records:
     DKIM TXT on `resend._domainkey`, the return-path MX + SPF TXT on `send.`, and DMARC on
     `_dmarc`. **The root's MX and SPF TXT belong to a separate mailbox provider** (the inbox
     for hello@ and the login and notify addresses) and must not be overwritten or replaced; Resend's records sit
     beside them and never touch the root.
   - The domain and the GitHub repo are already connected to the Vercel project.
   - Production env: `LAUNCH_GATE=on`, `SIGNIN_ALLOWLIST` (the operator plus a normal account
     for the smoke test) and `SUPERADMIN_EMAILS` (the operator) before the first deploy (§5 "Launch gate", §4
     "Cross-household reads for the operator"). Launch day: unset `LAUNCH_GATE` and redeploy
     (**done 2026-10-22**, a day early).
   - If uselejer.app is bought too: add it to the Vercel project as a permanent (308)
     redirect to uselejer.com, never a second production URL (`NEXT_PUBLIC_APP_URL`, email
     links and the calendar feed name only uselejer.com).

---

## 12. Open items to confirm during implementation

- ~~Neon role creation via SQL vs. the console.~~ SQL (§4 "Roles"): console roles join
  `neon_superuser`. Verified 2026-10-06: `lejer_app` `rolbypassrls = false`, not a member.
- Resend's daily counter boundary (UTC assumed). The budget rule is conservative either way.
- ~~Blob store shared across environments.~~ Decided 2026-10-06: `lejer-blob` is dev/preview
  only, permanently; production gets its own store at cutover (§11 step 7). `verify` pins
  lejer-blob by store id (`VERIFY_BLOB_STORE_ID`).
- `uselejer.com` domain verification at Resend (Aaron's DNS). Until then dev uses the test
  sender (§6); nothing in phase 2 blocks on it.
- ~~Whether `households_read`'s subquery needs a `SECURITY DEFINER` helper.~~ It does not.
  Verified 2026-10-06 on a Neon branch with a two-tenant probe (58 checks): fail-closed with
  no GUC (pooled and direct), `''` → NULL via `NULLIF` on a reused pooled backend, no
  cross-household reads/writes, composite FKs block cross-tenant children, 60 interleaved
  pooled transactions without leaks, switcher reads without recursion, owner unaffected.
