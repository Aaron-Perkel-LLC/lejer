# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lejer (uselejer.com): a hosted, multi-tenant Next.js 16 (App Router) + TypeScript + Tailwind v4
app for splitting household bills. Households sign up, invite roommates by email, post bills,
track who owes whom, and get reminder emails. It merges two earlier single-household apps that
share a lineage (both private, not in this repo) — `utilities` (one person pays everything) and
the peach app (each bill type has an owner who fronts it). When behavior is ambiguous, those
apps are the ground truth for intent; `ARCHITECTURE.md` (formerly `DESIGN.md`) records every decision made in the merge,
including a table of places the two apps disagreed and which way Lejer went.

**One data model, two modes.** Every bill type has an `owner_id`; posting a bill snapshots it
into `bills.owner_id`, and debts on a bill run to **the bill's** owner (reassigning a type only
changes who owns new bills). `households.mode` is `single_payer` (every type owned by the same person; UI hides the
owner column, dashboard says "you owe") or `ledger` (types carry their own owners, dashboard
shows who-owes-whom). Mode is a setting that drives defaults and copy; switching never
migrates data.

**`DESIGN.md` is reserved** for the Impeccable design skill (visual design context). Engineering
decisions go in `ARCHITECTURE.md`.

**Brand.** "Lejer" is the working name and may change before launch; the domain is uselejer.com
(the name stays Lejer). The name,
domain, app URL, mail domain and From addresses, the contact address (`contactEmail`,
hello@), the legal name (`legalName`, "Aaron Perkel LLC", the footer's legal line) and cookie
names live in `lib/brand.ts`; code and email templates read `BRAND` / `appUrl()` and never
spell them out (the `brand` verify suite fails on a stray literal). Every footer ends with
`app/components/LegalLine.tsx`: "{name} · © {year} {legal name} · Contact · Privacy". These docs keep saying "Lejer". Renaming changes the
cookie names, which signs everyone out once (accepted). Infrastructure identifiers (the
`lejer_app` Postgres role, the Neon/Vercel project names, the npm package) are not brand and
change only by migration.

**User research.** `SURVEY-RESULTS.md` records the October 2026 interest survey (22 responses;
the survey itself is the standalone PHP in `survey/`, hosted separately and outside both gates).
Read it before deciding features, onboarding or the name. In short: 64% would use it, and
the yeses come from people who feel the hassle. Two-thirds are single-payer households. The
top request, Venmo/Zelle pay links (81%), doesn't exist yet. "Who owes whom", calendar, phone
and PDFs land, and email reminders rank lower (38%). Trends, rent and documents are niche.
One person asked for settling debts across three or more people. The name averaged 2.86/5.

## Open TODOs

Bring these up when the user asks what's next or what's left, and before any cutover or
deployment work. Remove an item once it's done.

- **Drop the legacy TiDB databases after 2026-11-14.** The two households were imported into
  `main` on 2026-10-14 (ARCHITECTURE.md §11); the old sites are 308 redirects to the
  households' new URLs and their TiDB data is read-only until then. The imported roommates are
  on `SIGNIN_ALLOWLIST`, which the open site ignores.

- **The first imported household after the 2026-10-14 check-off deploy:** in Settings turn on
  "Payer's own check-off", then on Bills untick "You paid the provider" on the four bills the
  import flipped to paid (ARCHITECTURE.md §11), so the provider reminders pick them up.

- **After launch (the gate came off 2026-10-22):** send the launch note to the waitlist
  from `/admin` → Email → "The waitlist" (0018: each address gets it once, with a take-me-off
  link; `app/(site)/Waitlist.tsx` is where they signed up). Then **search**: in Search Console
  (the uselejer.com Domain property) submit `https://uselejer.com/sitemap.xml` (populated now
  that the gate is off) and use URL Inspection → Request indexing on `/`, `/how-it-works` and
  `/about`; link to uselejer.com from aaronperkel.com (it has no inbound link today). A brand
  query ("use lejer", "uselejer", "lejer app") takes days to a few weeks after the first crawl;
  "lejer" on its own competes with the Danish word for tenant and may never rank first.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build + typecheck — gate 1
npm run verify           # scripts/verify suites against the Neon dev branch — gate 2
npm run verify -- rls    # …or just the named suites
npm run start            # serve the production build
npm run migrate          # apply db/migrations/*.sql in order (owner role, DATABASE_URL_ADMIN)
npm run migrate -- --seed  # …then reset the two dev households from db/seed.sql
npm run email:dev        # React Email preview server for emails/*.tsx (port 3001)
npm run send-reminders -- --household <slug>   # run one household's reminder batch from the CLI
npm run mail:test -- <address> [kind ...]      # one real send of every template, or only the named kinds (deliverability check; needs RESEND_API_KEY)
```

**Branches, not `main`.** `main` deploys to production (since 2026-10-13), so **never commit
to `main` directly**: every change, docs included, goes on a branch, which Vercel builds as a
Preview on the dev database, and reaches `main` by a merged PR once both gates pass. **A branch
that adds a migration is run against Neon `main` before it is merged** (`DATABASE_URL_ADMIN=<main
owner URL> npm run migrate`, Deployment below), so the production deploy never boots ahead of
its schema. The dev branch gets the migration as usual (`npm run migrate`) before the preview
is pushed.

Two gates, in order: `npm run build` (typecheck + build), then `npm run verify`. `verify`
runs every suite in `scripts/verify/` against the **dev** branch only: it refuses unless
`DATABASE_URL_ADMIN` is dev's direct host and `DATABASE_URL` dev's pooled host, and then
checks that each connection reports dev's `neon.branch_id`. Suites build their own
throwaway households (`verify-<run>-*`, users `@verify.invalid`) and delete them, sweeping
leftovers from crashed runs first, so they never depend on or disturb the seed data. **Every
phase adds its checks there** (a new `scripts/verify/<suite>.ts` registered in `index.ts`).
Suites: `brand`, `tokens` (`lib/theme-tokens.ts` against `globals.css`'s statement, statement-dark,
peach, japandi and sheet blocks, `DESIGN.md`'s frontmatter and `.impeccable/design.json`, series colors
included; every face but sheet's Martian Mono `preload: false`, japandi's self-hosted in `app/fonts/` under 120 KB;
no color literals in `emails/`), `emails` (every template renders with its `PreviewProps`), `rls`, `identity`, `bills` (library level, real fixture contexts via
`ctxFor()`), `cron` (the tick, reminders, the thanks queue, the budget, bulk email, and the
ten-minute wake-up: `scheduleFlush`'s message, key and delay through an injected sender, its
no-op off Vercel, `flushHousehold` either side of the window and for a household marked for
deletion, and `vercel.ts`'s trigger against `WAKE_TOPIC`), `edits` (the new-bill email queue, edit/delete over the frozen split set,
the paid lock, `netPairs`), `deletion` (the sole member's typed-name delete, the vote: approve,
cancel, lapse; the read-only week and undo, the cron's hard delete of rows and the Blob prefix,
leaving, and a guard that no action refuses only the demo), `features` (mode switch, settings persistence, gating, trends math, calendar
contents), `admin` (the `admin_*` definer functions: SECURITY DEFINER, pinned `search_path`,
EXECUTE for the owner and `lejer_app` only, no amount/hash/path/token column in any result,
the counts and users they return for the fixtures from a pooled connection with no GUC that still sees
zero tenant rows directly, the operator's delete-user and delete-household with their refusals,
the operator's note: who each audience resolves to, what goes out, the preview, the refusals,
the budget and the waitlist audience (0018: once per address, stamped `notified_at`, a failed
send left waiting), the tick's outcome stamp, `isSuperadmin` parsing; the page's 404
and 200 and its three actions over the wire are in `http`), `mail` (the unsubscribe token, member-,
user- and waitlist-scoped (a waitlist click deletes the row), what a click turns off, every recipient query honoring `muted_kinds`,
`sendMail`'s scope guard; the page, one-click POST and account checkboxes are in `http`), `http` (starts `next start` on gate 1's build, refusing a build older than the
sources; fixed port 4317 or `VERIFY_PORT`, in its own process group, pid in the gitignored
`.verify/server.json`: a run that died without cleaning up is found and its server group
killed on the next run, and a `next` process still holding the port is freed, while anything
else on the port makes verify refuse rather than kill it; mints sessions with `SESSION_SECRET`; forces console mail; drives server actions the
way the client does: plain forms as `$ACTION_ID_<id>` posts, `useActionState`/direct calls with
a `Next-Action` header and React's `encodeReply` body, referenced `_1_*` fields **before** the
root `"0"`). Suites write real blobs, so `verify` also refuses unless `BLOB_READ_WRITE_TOKEN`
belongs to lejer-blob (the store id is embedded in the token), and its sweep deletes each
fixture household's `h/{id}/` prefix **before** its rows, so a crashed run is cleaned up by the
next one.
`npx tsc --noEmit` typechecks alone.

## Configuration

Env lives in `.env.local` (see `.env.example`). Keys:

- `DATABASE_URL` — Neon **pooled** URL for the `lejer_app` role (RLS enforced). All app code.
- `DATABASE_URL_ADMIN` — Neon **unpooled** URL for `neondb_owner` (table owner, so RLS does
  not apply to it). Only four call sites may use it: `scripts/migrate.ts`,
  `createHousehold()` in `lib/households.ts`, the household
  enumeration in `lib/cron.ts` (behind `app/api/cron/tick`), and the slug lookup in
  `scripts/send-reminders.ts`.
  Anything else reading it is a bug, except `scripts/verify/` (dev-only, guarded; it needs the
  owner to build fixtures and inspect the catalog). The operator's `/admin` is **not** a sixth
  site: its cross-household reads go through the `admin_*` `SECURITY DEFINER` functions
  (0011), which return aggregates and household metadata only.
- `SESSION_SECRET` — jose HS256 key for the `lejer_session` cookie.
- `RESEND_API_KEY` — sends from `login@uselejer.com` (codes, invites) and
  `notify@uselejer.com` (household mail), on the root domain with no `mail.` subdomain.
  Resend is set up directly at resend.com, not
  through the Vercel marketplace. **Empty outside production = console mode**: `sendMail()`
  prints the message (login codes included) with a `[mail:console]` prefix instead of sending,
  and writes no `email_log` row. In production (`VERCEL_ENV=production`) there is no fallback:
  `instrumentation.ts` refuses to boot without the key, so codes can never land in logs.
  Stored in Preview and Production only (removed from Development 2026-10-12), so local dev
  runs in console mode and spends nothing of the Resend quota (Pro since 2026-10-18: 50,000 a
  month, no daily cap; the app's own ceilings are in `lib/mail-limits.ts`); set it in
  `.env.local` by hand only when testing real delivery, and take it out after.
- `RESEND_TEST_SENDER` — `1` sends every message from `onboarding@resend.dev` (display name
  kept); ignored in production. **Set nowhere** since 2026-10-12: every environment sends from
  `uselejer.com`. Resend's test sender only delivers to the Resend account owner's address, so
  it is only for a local run against a key whose domain isn't verified.
- `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` — the environment's **private** Blob store: lejer-blob
  for development and preview, a separate store for production (Deployment, below). On Vercel
  the SDK uses OIDC; the token is needed locally, for client-upload token minting, and for the
  import script.
- `CRON_SECRET` — bearer token for `/api/cron/tick`; Vercel Cron sends it from the project's
  Production env, so the route accepts only Vercel's own invocations (and `curl` with the secret).
- `NEXT_PUBLIC_APP_URL` — `https://uselejer.com`; used for absolute links in email and `/cal.ics`.
- `LAUNCH_GATE` — **unset since launch (2026-10-22, a day ahead of the announced Friday)**;
  the mechanism stays so the site can be closed again. `on` closes it (`lib/gate.ts`;
  ARCHITECTURE.md §5 "Launch gate"): `/` is a coming-soon page (its heading names
  `LAUNCH_DATE`, 2026-10-23, until that day has passed), `/about`, `/how-it-works` and `/demo…`
  redirect there (`proxy.ts`), `/login` and `/privacy` stay open, every response carries
  `X-Robots-Tag: noindex, nofollow` (plus the meta tag; `robots.txt` stays crawlable so Google
  sees the noindex, and `sitemap.xml` is empty), and sign-in
  and invites are limited to `SIGNIN_ALLOWLIST`. Any other value, or unset, is open, so opening
  or closing is one env change and a redeploy. Set `on` in Production only; never in Preview or
  locally.
- `SIGNIN_ALLOWLIST` — comma-separated addresses that may request a code or be invited while
  gated (ignored since launch, kept so the gate works if it ever goes back on); empty means
  nobody. Checked in `requestCode` before any row is written or sent, so a refused address costs nothing of the Resend budget; `submitCode`,
  `inviteMember` and `resendInvite` check it too. Ignored when the gate is off.
- `SUPERADMIN_EMAILS` — comma-separated addresses that may open `/admin` (`lib/superadmin.ts`).
  Everyone else, signed in, gets not-found, never a 403. Empty means
  nobody. **Operator-only accounts:** signing in lands on `/admin` whatever `next=` says;
  `/new`, `/households` and every household page redirect there (`requireMemberUser()`,
  `requireUser()`); `accept()` in `lib/context.ts` never gives one a ctx, so a pending invite
  is never accepted; `inviteMember`/`resendInvite` refuse the address ("runs the site"). Their
  pages wear SiteShell's operator header (wordmark, Admin, Sign out). Set in Production and
  Preview (2026-10-13); unset locally unless you're working on the page.
- `APP_DEV_USER` + `APP_DEV_HOUSEHOLD` — bypass login as that email (both must be set); the
  slug is where "Sign in" lands, while pages still show the household their URL names.
  Honored only when `VERCEL_ENV !== "production"` (local + preview). There is no passphrase
  login and no `APP_DEMO_MODE`; the demo is the `/demo` household URL.
- `VERIFY_NEON_PROJECT_ID`, `VERIFY_NEON_BRANCH_ID`, `VERIFY_NEON_ENDPOINT_ID`,
  `VERIFY_BLOB_STORE_ID` — the dev branch and dev Blob store `npm run verify` pins: it refuses
  connection strings or a Blob token that point anywhere else.

**Recovering `.env.local` on a new machine.** The Vercel project's **Development** environment
holds the dev values (Neon `dev` branch URLs, `SESSION_SECRET`, `CRON_SECRET`, the Blob
token and store id), so linking the project with the Vercel CLI (`vercel link`) and running
`vercel env pull .env.local` restores them.

Keys that are empty locally (`APP_DEV_*`) are not stored there; add them by hand.
`RESEND_API_KEY` is not in Development (console mail locally); when a real send has to be tested,
add it to `.env.local` by hand. `vercel link`/`env pull` rewrite the whole file (comments are lost;
`.env.example` documents the keys) and add `VERCEL_OIDC_TOKEN`. Each Neon branch has its own
`lejer_app` password, so changing dev's never touches production.

## Architecture

### Request context and tenancy

**Every household lives at its own URL** (ARCHITECTURE.md §5 "Household URLs"): `/` is the
public site for everyone, `/{slug}` a household's overview (dashboard) and `/{slug}/bills`, `/household`, `/trends`,
`/documents`, `/welcome` its pages; `/login`, `/new` (onboarding), `/households` and
`/account` sit outside any household. `lib/paths.ts` holds `householdPath(h, path)` (build
every household link and redirect with it), `householdSlugOf()` and `RESERVED_SLUGS`: a new
top-level route needs its name reserved first (the identity suite checks).

`lib/context.ts` `getCtx()` (React `cache()`, once per request) turns the URL's household plus
the session into `{ user, membership, household, demo }` or `null`. `proxy.ts` reads the slug
off the path and passes it in the `x-household` request header (any client-sent copy is
dropped); `getCtx()` looks it up under `withUser`, so no membership means no ctx, and opening a
pending invite's household accepts it. `/demo…` is the in-memory demo for anyone. Routes whose
URL has no slug (`/files`, the document upload handshake, `/account`'s calendar reset) use
`getCtxForHousehold(id)` with the id the key or form names. It replaces the old
`getCurrentPerson()`.

**One session transaction per request.** `getCtx`, `getSessionUser`, `getCtxForHousehold`,
`getMyHouseholds` (the switcher, `/households`) and `homePath` all read one cached
`loadSession()`: a single `withUser` running `loadMyHouseholds()` (`lib/households.ts`), one
statement that joins the user, every membership and its household. The layouts pass
`households` into `AppShell`, which opens no transaction of its own. Page loaders
(`lib/views.ts`) open one `withHousehold` and issue their independent reads together with
`Promise.all` (postgres.js sends them in order on the transaction's connection); a page is
fetched at the requested offset without waiting for the count, so `?page=` is clamped
(`MAX_PAGE`) and the page redirects when the count disagrees. The `identity` suite budgets the
statement count of the session read and of `loadDashboard` / `loadBills` through `dbStats`
(`lib/db.ts`; `DB_TRACE=1` also prints each statement), so a stray extra query fails verify.
Measured on a Vercel preview, not localhost: Vercel iad1 to Neon us-east-1 is 1–2 ms a round
trip, so fewer transactions and statements are what matter, not wire tricks; `set_config` stays
its own parameterized statement, first in every transaction.

**No tenant query runs outside `withHousehold`.** `lib/db.ts` exports:

- `withHousehold(ctx, tx => …)` — `sql.begin` that first runs
  `set_config('app.household_id', …, true)` and `set_config('app.user_id', …, true)`, then your
  callback. Pages open one per request and pass `tx` into every `lib/*` data function (they all
  take `tx` first).
- `withUser(userId, tx => …)` — sets only `app.user_id` (`null` before login, e.g. looking up
  the email being verified); for `users`/`login_codes` and the household switcher.
- `adminSql()` — the owner connection, created on first call. See the four allowed call sites
  above.

Clients are created lazily, so importing `lib/db.ts` needs no credentials (the build, scripts).

The raw `sql` client is not exported. If you find yourself importing `postgres` outside
`lib/db.ts`, stop. The one exception is `scripts/verify/harness.ts`, whose RLS probes need raw
transactions with and without GUCs on pooled and direct connections.

**Row-level security is the second lock.** Every household table has `ENABLE ROW LEVEL
SECURITY` — deliberately **not** `FORCE`, so the table owner (`neondb_owner`) is exempt and
`lejer_app` (`NOBYPASSRLS`) is enforced — with policies on
`household_id = app_household_id()`, where `app_household_id()` is
`NULLIF(current_setting('app.household_id', true), '')::int` — the `NULLIF` matters because
a finished `SET LOCAL` leaves `''` on a pooled connection and `''::int` throws. Missing
setting → NULL → zero rows, zero writes. `memberships` and `households` have a wider
**SELECT** policy (rows where `user_id = app_user_id()` / households the user belongs to) so
the switcher can list names; their write policies are household-only. `users` and `login_codes` have no RLS. **The operator's cross-household reads** (`/admin`,
`lib/admin.ts`) are the six `admin_*` functions in 0011 and 0013 (`admin_households`, `admin_totals`,
`admin_weekly`, `admin_email_kinds`, `admin_email_failures`, `admin_users`), each `SECURITY DEFINER` with a
pinned `search_path`, EXECUTE revoked from PUBLIC and granted to `lejer_app`, returning
aggregates, household metadata (name, slug, mode, theme, counts, times, deletion state, the
last tick) or the users list (name, email, memberships) and never a bill amount, an address's
hash, a file path or a token; the `admin` suite refuses a result column named like one. The
operator's two writes (`deleteUserAsOperator`, `deleteHouseholdAsOperator`) reuse
`removeMembership` and `hardDelete` under the system scope. The app-side lock is `requireSuperadmin()`
(`lib/superadmin.ts`, `SUPERADMIN_EMAILS`, not-found for anyone else); a bug there could expose
names and addresses, never bills. `email_log` is the exception to the tenant policy: inserts accept
`household_id IS NULL` (login codes), reads are household-only, there is no UPDATE/DELETE
policy, and account-wide counts go through `email_sends_since(since, kind?)` — a
`SECURITY DEFINER` function that returns only a number, executable by `lejer_app` alone.
Never `INSERT … RETURNING` a NULL-household `email_log` row: `RETURNING` must pass the SELECT
policy, so it fails. The calendar feed has no session, so `calendar_context(token)` (same
`SECURITY DEFINER` hardening) maps a membership's `calendar_token` to
`(household_id, membership_id)` and nothing else; the feed then runs inside `withHousehold`.

**Neon pooling rules** (the pooled endpoint is PgBouncer in transaction mode): never session
`SET`, only `set_config(..., true)` / `SET LOCAL` inside a transaction; `prepare: false` in the
postgres.js options is mandatory; keep transactions short; no `LISTEN`, no session advisory
locks, no temp tables.

### Database

postgres.js (raw SQL, no ORM) with type parsers so `DATE` columns are `YYYY-MM-DD` strings and
`NUMERIC`/`COUNT(*)` are numbers — the Postgres equivalent of the old mysql2 `dateStrings` +
`decimalNumbers`. `TIMESTAMPTZ` stays a `Date`. Schema lives in `db/migrations/` (numbered SQL,
applied by `scripts/migrate.ts`, tracked in `schema_migrations`). `db/seed.sql` seeds one
household of each mode.

Tables (all tenant tables carry `household_id`; children also have composite FKs
`(parent_id, household_id)` so a child can never point across households):

- `households` — settings row: `mode`, `theme` (`statement`|`peach`|`japandi`|`sheet`, 0006/0007), `color_scheme`,
  `timezone`, `ask_bill_date`, `bills_per_page`, `feature_*` booleans (rent, trends,
  bulk_email, documents, welcome_tour, thanks, owner_checkoff: the payer's own check-off, 0017,
  on for a new single-payer household), rent columns, reminder schedule
  (`reminders_enabled`, `send_hour` in the household's tz, `first_reminder_days`,
  `urgent_reminder_days`) and cron bookkeeping (`last_run_at`, `last_send_date`,
  `last_sent_at`, `last_sent_count`, and `last_tick_outcome`, one line per tick, 0011), email identity (`from_name`, `reply_to`, `digest_email`),
  deletion (`deletion_requested_at`, `deletion_requested_by`, `delete_after`, 0009; a household is
  never requested and marked at once)
- `users` (`email` citext unique = login identity, `name`, `muted_kinds` the operator's mail
  categories they turned off, 0016) — global
- `memberships` (`household_id`, `user_id`, `role` `admin`|`member`, `splits_bills`,
  `welcomed_at`, `invited_by`, `joined_at` NULL until first sign-in, `calendar_token` 32 random
  bytes base64url, unique, generated on insert, reset with `SET calendar_token = DEFAULT`,
  `muted_kinds` the mail categories they unsubscribed from, 0014) —
  everything per-person per-household hangs off `memberships.id`, not `users.id`
- `bill_types` (`name` unique per household, `emoji` optional, NULL for none (0012), `processing_fee`, `owner_id` →
  memberships, SET NULL on delete, `in_trends`: "Show on Trends", off leaves the type out of the
  chart, totals and CSV, 0019)
- `bills` (`type_id` RESTRICT, `bill_date`, `due_date`, `total`, `per_person_cost`, `status`
  `unpaid`|`paid` as a CHECK, `pdf_path`, `added_by_id`, `owner_id` → memberships SET NULL +
  `had_owner`, both set at post time from the type's owner, 0004; `fee`, `shares`,
  `owner_share`, the frozen split, and `notice_kind`/`notice_queued_at`/`notice_extra`/
  `notified_at`, the new-bill email queue, 0005; `owner_paid_at`, the owner's own "I paid the
  provider" tick, NULL until they do, 0017). The ledger, balances,
  reminders' Reply-To and permission checks on an existing bill (`assertCanManage(ctx,
  bill.ownerId)`) all use the bill's owner; `assertBillManager(tx, ctx, typeId)` (the type's
  current owner) only gates posting new bills. A removed owner reads as `FORMER_MEMBER`
  ("former member"); a bill posted for an ownerless type is owed to "the house"
- `bill_debts` (`bill_id`, `person_id`, `paid_at`) — the bill's debtor set, **written once when
  the bill is posted** (0003) and rebuilt only by an edit before anyone has paid, over the same
  frozen split set (0005). Paying sets `paid_at`, un-paying clears it, so
  unchecking restores exactly the original debtor and late joiners never get rows on old bills.
  The owner never gets a row. A bill is `paid` when no row has `paid_at IS NULL`; `setPaid` and
  `refreshBillStatus` keep `bills.status` in step transactionally (also after a member removal
  cascades their rows). Everything "still owed" filters `paid_at IS NULL`
- `payment_thanks` — debounced thank-you receipts (`lib/thanks.ts`), only when `feature_thanks`
- `deletion_approvals` (`household_id`, `membership_id`, `approved_at`) — who has approved the open
  deletion request (0009; ARCHITECTURE.md §5 "Deleting a household and leaving")
- `documents` (`file_path` always under `h/{id}/documents/`, `uploaded_by` SET NULL)
- `login_codes` (`email` citext, `code_hash`, `attempts`, `ip_hash`, `created_at`, `expires_at`) —
  keyed by the normalized email, not `users.id`: requesting a code never creates a user
- `email_log` (`household_id` nullable, SET NULL when its household is deleted (0009), `kind`,
  `to_hash`, `ok`, `sent_at`) — every send; source of truth for the daily budget (via
  `email_sends_since()`) and the settings readouts

Bill math: `total = amount + processing_fee`, `per_person_cost = round(total / splitters, 2)`
where splitters are memberships with `splits_bills`; debt rows for every splitter except the
owner. `getOwedPairs(tx)` in `lib/bills.ts` is the who-owes-whom ledger and works in both
modes. **Status:** a bill is `paid` when no debt row is open and, with `feature_owner_checkoff`
on, its owner has ticked `owner_paid_at` (ARCHITECTURE.md §3 "The payer's own check-off"); the
tick is `setPaid` with the owner's own id (no row, no receipt, no lock), `Bill.ownerPaid` is
null when the setting is off, posting writes the column settled when off, and flipping the
setting recomputes every status. It stays gross everywhere; the dashboard's `ledgerGroups()` pairs up two people who
owe each other and adds a muted "Settling at once?" hint with the net from `netPairs()`, never
a net figure as the primary number.
SQL aliases snake_case to camelCase (`per_person_cost AS perPersonCost`); bill queries
join `bill_types` and the bill's owner/poster memberships so each `Bill` carries
`typeName`/`typeEmoji`/`ownerId`/`ownerName`/`addedByName`.

**Fixing a posted bill** (0005, ARCHITECTURE.md §3). Posting queues the new-bill email on the
bill row (`lib/notices.ts`, `NOTICE_DELAY_MINUTES` = 10 in `lib/notice-delay.ts`); the cron
tick and every bill mutation's `after()` flush what has waited out the window, and a mutation
that leaves anything queued publishes the **ten-minute wake-up** (`lib/wake.ts`,
`scheduleFlush`: one Vercel Queues message on `flush-queues`, delayed a minute past the window,
keyed per household and minute; `app/api/queues/flush` consumes it with `flushHousehold()` in
`lib/cron.ts`; a no-op off Vercel, every failure logged, the tick the fallback), so the email
lands on time rather than at the next hour (ARCHITECTURE.md §8 "Wake-ups"). Until any debt
row has `paid_at`, the bill's owner or an admin can `updateBill` (recomputes over the bill's
frozen `shares` and never consults today's splitters; a type change re-snapshots the owner
inside the same set) or `deleteBill` (its PDF is deleted after commit). An edit still inside
the window restarts it; one after the email went out queues a single "Corrected" email to
everyone on the bill before or after the edit plus both owners. Deleting an already-emailed
bill sends a "Bill removed" note right away.

### Auth flow

`proxy.ts` requires a valid `lejer_session` cookie for everything except `/login`, `/demo…`,
`/cal.ics`, `/api/cron`, `/api/documents/upload`, the public site (`/`, `/how-it-works`,
`/about`, any method, since the home page's sign-up form posts back to `/`), icons and static
assets; non-GET without one gets 401, GET redirects to `/login?next=`; the 30-day session
cookie is re-issued once a week old. The session JWT is identity only, `{ uid }` (audience
`session`; older tokens' `hid` is ignored). On a signed-in GET of a household page the proxy
also sets `lejer_household` (the slug; a preference, not a credential), which `homePath()` in
`lib/context.ts` uses: the last household opened, else the first joined, else `/new`. `next=`
goes through `safeNext()` (`lib/flash.ts`), which rejects `//host` and `/\host`.

The flow is a normal product site's: `/` is the landing page signed in or not (its header
says "Open your household" to someone signed in); `GET /login` while signed in redirects to
`next=` or `homePath()` (except on the code step, so you can sign in as another address);
signing out lands on `/`. `getSessionUser()` serves pages that need the user but no household
(`/new`, `/households`, `/account`).

While `LAUNCH_GATE` is `on`, `requestCode` refuses any address not on `SIGNIN_ALLOWLIST`
with a neutral "isn't open yet" before a code is minted or sent (`lib/gate.ts`;
`submitCode` and invites check the same). `/login` is the same two-step form as before: email → 6-digit code → session. Differences:
an unknown email still gets a code (anyone can sign up) and the request writes nothing to
`users`; a verified code creates the `users` row with a placeholder name from the email's
local part, and first-timers land on onboarding (`/new`: their real name first, then
household name, mode, the utilities the house splits, theme, timezone), which calls
`createHousehold()` (slug from the name, `-2` and up on a collision or a reserved name; the
picked utilities owned by the creator) and sets `ask_bill_date` from the mode, then opens the
tour at `/{slug}/welcome`, whose finish or skip lands on the overview. A returning user goes to `next=`, else
the newest invite, else `homePath()`. Every email is normalized once (`normalizeEmail()`: trim +
lowercase) and the column is citext, so all per-email caps key on one spelling. Codes: sha256
at rest, 10-minute TTL, 5 wrong guesses, 30 s burst dedupe, 5 per email per 10 min, 10 per IP
per hour (`ip_hash`), and a global `LOGIN_DAILY_LIMIT` (300, `lib/mail-limits.ts`) per UTC day
from `email_sends_since(…, 'login_code')`, a safety valve well under the month's quota. A send that fails releases its code.
Verifying also accepts every pending invite (`joined_at`), one `withHousehold` per household,
since `memberships_write` only admits the current one.

**Library mutations take `ctx` and authorize themselves** (`assertAdmin(ctx)`,
`assertBillManager(tx, ctx, typeId)` in `lib/auth.ts`), throwing `ActionError` (`lib/errors.ts`)
for anything the person should be told; actions turn it into `?err=` or an inline error, and
anything else propagates as a bug. Pages read through one loader each in `lib/views.ts`, which
is where the `ctx.demo` branch lives. **Read-only households:** `readOnlyReason(ctx)` is the demo
refusal or, for a household marked for deletion, "being deleted on …"; every action checks it
where it once checked `ctx.demo` (the `deletion` suite fails on an action that refuses only the
demo), the `assert*` helpers throw it, and pages hide their controls. Only `lib/deletion.ts`'s
vote and undo skip it.

**Page-level authorization** is `requireUser()` (no ctx → not-found if signed in, so a slug
never confirms a household exists, else `/login`) / `requireAdmin()` (`/{slug}/no-access`) in
`lib/auth.ts`, and `requireUserAction()` /
`requireAdminAction()` / `requireBillManager(tx, typeId)` for server actions (throw). Every
action authorizes itself; `proxy.ts` is only the first lock. A `member` can read everything
(including `/household` and its settings, read-only) and, for types they own, post bills and mark
payments. `admin` does everything. The last **joined** admin can't be demoted or leave; anyone else
can leave (`leaveHousehold`), and admins remove others, never themselves. Invites are memberships with `joined_at NULL` plus a `users` row created up
front (an admin vouched for the address; the typed name only applies if the person is new);
the code login proves address ownership, so there is no invite-token table. Names live on
`users` and are shared across households, so only their owner edits them (`/account`).

Switcher: `/households` lists the user's memberships as links to each household's URL. The
nav's household name is always a plain link home; someone in more than one household switches
from the one menu under their name ("Switch to", then Account, Your households, Sign out),
since everything there is theirs rather than the household's. Two households can be open in
two tabs. The nav's links are the household's own (`navLinks`: Overview, Bills, Trends, Docs,
Members, Settings). Every household page follows DESIGN.md "Page Header and Actions": one
action slot at the title's right, section actions on their rule, adds in the shared Dialog,
row actions as words, destroy confirming inside its Edit dialog (`DialogConfirm`).

Demo: `/demo` is the in-memory ledger household from `lib/demo.ts` at its own URL, for anyone,
with no cookie; `withHousehold` throws on a demo scope, and actions refuse with
`DEMO_REFUSAL`. A signed-in visitor sees it there too and their own household stays at its
own URL.

### Stored files

Private Blob storage, one store per environment class (lejer-blob for dev/preview, its own
store for production; household ids come from different databases, so the two must never
share a store). Keys (`lib/blob.ts`): bill PDFs
`h/{household_id}/bills/{year}/{type-slug}/{MMDD}-{billId}.pdf` (MMDD from the bill date; the
bill id keeps same-day bills apart; `allowOverwrite: true`; the upload's own filename is ignored
because providers reuse one name per statement; `addBill` reserves the id with `prepareBill`,
uploads, then inserts); documents
`h/{household_id}/documents/{slug}-{suffix}.{ext}` (`addRandomSuffix: true`).

`app/files/[...path]/route.ts` is the only read path: resolves the ctx of the household the key
names (`h/{id}/`, `getCtxForHousehold`; no membership → 404), rejects keys not under
`h/{ctx.household.id}/`, then confirms the key exists in `bills.pdf_path` or
`documents.file_path` **inside `withHousehold`** (RLS as the second lock), applies the extension
allowlist (pdf/png/jpg/jpeg/heic/heif, no SVG) + `nosniff`, and streams `get()`.

Bill PDFs go through the `addBill` server action (4 MB `bodySizeLimit` under Vercel's 4.5 MB
cap, optional). Documents upload client-direct via `handleUpload` in
`app/api/documents/upload/route.ts`, which gates on admin of the household the pathname names
(`getCtxForHousehold`) and **refuses** any pathname outside that household's documents prefix (the client token is bound to the requested
pathname and can't be rewritten; the page passes the prefix to the form); `onUploadCompleted` is intentionally a no-op
(never fires against localhost) and `addDocument()` `head()`s the key before inserting.

### Email

`lib/mail.ts` wraps Resend: `sendMail({ ctx?, to, subject, react, replyTo?, kind })` returns
`false` on failure (logged, not thrown) and writes one `email_log` row per attempt (except in
console mode), in its own short transaction after the send, without `RETURNING`. `ctx` logs
the row under that household; without it the row is `household_id NULL`. From is
`"{from_name ?? household name} via Lejer" <notify@uselejer.com>`; Reply-To is
`households.reply_to`, except reminder and new-bill emails use the bill owner's email.
Login codes and invites come from `"Lejer" <login@uselejer.com>` with no Reply-To.

New-bill mail (`lib/notices.ts`, queued) and reminder mail (`lib/notify.ts`) go only to members who have **joined**: a
pending invite's address isn't proven, so it gets nothing but the invite. Reminders are urgent
within the household's `urgent_reminder_days`, counted in its own calendar (`lib/time.ts`).

The operator's note (`operator_note`, `emails/OperatorNote.tsx`, sent from `/admin`) is the
third sender class: `"Lejer" <hello@uselejer.com>` (the contact address), Reply-To honored, no
household, logged with `household_id NULL`. It reads as a letter: the name once in the
masthead, no eyebrow, the subject as heading, and a
footer of the reply address plus the legal line (`Shell`'s `footer` is optional for it).

Templates are React Email components in `emails/`, all wrapped in `emails/Shell.tsx`, which
renders the statement or peach shell from `households.theme` (inline styles only, light-only,
560 px). Copy is gender-neutral; the noun ("statement"/"ledger") follows the theme. Every send
is HTML plus the same template as plain text, and every footer ends with "Lejer · Aaron Perkel
LLC"; Resend's click and open tracking are off for the domain (dashboard setting).

**Unsubscribe** (0014, `lib/unsubscribe.ts`; ARCHITECTURE.md §6 "Deliverability and
unsubscribe"). Every kind in `CATEGORY_OF` (reminders, bill notices, payment receipts, admins'
notes, digest copies) must be sent with an `unsubscribe` scope (`sendMail` and the verify
recorder throw otherwise); it then carries `List-Unsubscribe` + one-click headers and a footer
link to `/api/unsubscribe?k=<signed token>`, which turns off that one category for that member
(`memberships.muted_kinds`) or clears `digest_email`. POST is one-click; GET goes to the
`/unsubscribe` page, which asks first. Recipient queries filter `muted_kinds`, and the account
page has the checkboxes to turn things back on. The operator's `updates` category is the one
addressed to a person, not a member: its token is `{ uid, cat }`, a click sets
`users.muted_kinds` (0016), and the account page's "Email from Lejer" card has its checkbox.
The launch waitlist's note (`waitlist_note`, 0018) is the one category addressed to an address
with no account: its token is `{ wl, cat }` and a click deletes the `waitlist` row ("Take me
off the waitlist"); the operator sends it from `/admin` once per address (`notified_at`).
Login codes, invites, deletion mail and the "moved" notice are transactional: no header, never
muted. `npm run mail:test -- <address>` sends one of every
template (needs a real `RESEND_API_KEY` in `.env.local`; ~11 of the day's 100).

### Cron

`app/api/cron/tick/route.ts` (bearer `CRON_SECRET`, timing-safe; 500 without a server secret,
401 for a missing or wrong header; `maxDuration = 120`) calls `tick()` in `lib/cron.ts`, which
enumerates households with `adminSql` and runs `tickHousehold()` for each with a system scope
(`user: null`), in **short** transactions only: reads and stamps, never a send inside one. Per
household: stamp `last_run_at`, and at the end stamp `last_tick_outcome` with one line
(`tickSummary()`: "sent 3, 1 failed", "skipped: nothing due", "deferred: budget", "error: …";
shown on `/admin`); deletion first (ARCHITECTURE.md §5): a household marked for
deletion whose `delete_after` has passed is deleted, its `h/{id}/` Blob prefix then its row
(cascading, under the system scope, so no new owner-role call site), one still in its week runs
nothing else, and a deletion request past 14 days is cleared and everyone emailed; flush the thanks queue (`lib/thanks.ts`, own 10-minute debounce,
every tick, if `feature_thanks`; payment edits also flush via `after()`) and the new-bill email
queue (`lib/notices.ts`, every tick, never deferred), both through `flushHousehold()`, which the
ten-minute wake-up's consumer (`app/api/queues/flush`, a Vercel Queues trigger in `vercel.ts`;
`lib/wake.ts`) also runs for one household when a bill action's delayed message arrives; then, on the first tick
at or after `send_hour` in the household's timezone, **claim the day** atomically (`last_send_date
< today`, never `!=`), check the account-wide UTC-day ceiling (`email_sends_since()`, batch plus
confirmation copy past `CRON_DAILY_LIMIT`, 1,200 in `lib/mail-limits.ts` → release and
**defer**; the ceilings are the app's own safety valves under Resend Pro's 50,000 a month, not
the plan's limits), and send. A batch where every send failed
releases its claim. Releases are compare-and-set (`WHERE last_send_date = <the date this tick
claimed>`), so a slow failing tick can't clobber a later success. Who gets what is
`lib/reminders.ts`: heads-up at exactly `first_reminder_days`, urgent daily from
`urgent_reminder_days` through the due date, then every `OVERDUE_EVERY_DAYS` (3) once overdue
(overdue days 1, 4, 7, …); with `feature_owner_checkoff` on, the owner of a bill they haven't
ticked off gets a `provider` reminder on the same cadence (the total, no "Pay to"). `scripts/send-reminders.ts` runs the same per-household tick for one
slug, ignoring `send_hour` (`--force` also skips the claim and budget). Bulk email
(`/household/email`) and the operator's notes refuse past `BULK_DAILY_LIMIT` (1,000) sends for
the day, leaving room for reminders and codes.
Verify never ticks the seed households: `tick({ only })` takes fixture ids, and every library-level
send goes through an injected recorder (`.env.local` may hold a real `RESEND_API_KEY`).

Scheduler is a Vercel Cron Job in `vercel.ts` (`7 * * * *` → `/api/cron/tick`; the project is
on the Pro plan, whose crons can run every minute, where Hobby's run once a day). Vercel sends
`Authorization: Bearer $CRON_SECRET` from the project env, and crons run only on Production
deployments, so it starts by itself at cutover and previews never tick the dev data. A missed
run only delays mail: the "at or after, once per day" rule tolerates it. (Until 2026-10-12 the
scheduler was a GitHub Actions workflow, chosen while the project was on Hobby.)

### Key surfaces

- **Three root layouts, two shells.** A household's pages live in `app/(household)/[household]/`
  under its own root layout (re-rendered whenever the slug changes, since the theme sits on
  `<html>` and a shared root layout survives client navigations), rendering
  `app/components/AppShell.tsx` (nav, theme, fonts, demo banner, and `DeletionBanner` while a deletion is requested or scheduled). The public site, `/login`
  included, lives in `app/(site)/` under its own root, and the pages outside a household
  (`new`, `households`, `account`, in `app/(app)/`) have a root of their own that renders the
  same `app/(site)/SiteShell.tsx` (the drafting-sheet look, `site.css`, `s-*` classes): a page
  that belongs to no household wears the site's look, not a household theme. URLs don't
  include groups, so paths below like `app/bills/` mean `app/(household)/[household]/bills/`,
  served at `/{slug}/bills`. Crossing between roots is a full page load, so no `<html>` leaks
  into another.
  `app/global-not-found.tsx` (experimental `globalNotFound`) is the 404 for unmatched URLs,
  since no single layout covers them; `app/metadata.ts` holds the metadata the roots share
- `app/(site)/` — the public site (`lib/site.ts`): home at `/` for everyone, `/how-it-works`,
  `/about`, `/privacy` (plain-English: what's kept, the processors, cookies, what the operator
  can see, deletion, contact; linked from the legal line, not the header) and `/login`. Its look is its own (`site.css` on
  `html[data-site]`: a drafting sheet, Archivo + Martian Mono, the four utility-locate colors;
  DESIGN.md "Public Site"), not either household theme. `FloorPlan.tsx` is the interactive
  sample household from `lib/demo.ts`; the sign-up form is the real `requestCode` action. The
  site root has no `loading.tsx`, so `/login`'s signed-in `redirect()` is a real 307
- `app/page.tsx` (`/{slug}`) — the overview, where every household email lands: "+ Add bill" in
  the header slot (`AddBillDialog`, the same dialog as Bills; a post lands back here), the
  mode-aware summary strip (you owe / next due / bills on record), "Owed to you" (bills the
  viewer fronts that are still owed, with their check-offs and Remind) and "You owe" (each open
  share and whom to pay), both from `getOpenBills()` in one statement, then the house ledger
  (hidden in single-payer when the viewer is the payer) and calendar subscribe buttons at the
  foot. Paid history lives on Bills. Every page follows DESIGN.md "Page Header and Actions"
- `app/bills/` — `/bills`, posting and the archive: "+ Add bill" in the header slot opening
  `AddBillDialog` (honors `ask_bill_date`), payment checkboxes, Remind and Edit as words, the
  edit dialog while nobody has paid (Delete confirms inside it); actions in
  `app/bills/actions.ts`
- `app/household/` — three pages and no sub-nav. `/household` is **Members** in the nav:
  "+ Invite" in the header slot (`InviteDialog`), "Email everyone" on the members list's rule
  for admins when bulk email is on, Edit per member (Remove confirms inside the dialog).
  `/household/settings` (features, theme, reminders, timezone, email identity, rent, mode
  switch), a main-nav link of its own (`navLinks`; the nav lights only the longest matching
  link); **Utilities** come first (`settings/UtilitiesSection.tsx` at `#utilities`: the bill
  types and their owners, owner column in ledger mode; a household with none gets a "First step"
  panel on the overview linking there), then the form, and, last, **Leave or delete**
  (`settings/LeaveOrDelete.tsx`: leave, the sole member's typed-name delete or an admin's
  request, and the CSV), usable by members too. Member, utility, leave and delete actions are
  in `app/household/actions.ts`; `/household/export` is every bill and payment as CSV
  (`lib/export.ts`), for any member, any time. The Look group saves itself: picking a theme card (or statement's dark-mode choice)
  paints `<html>` at once and calls `saveLookAction` (`saveLook` in `lib/settings.ts`), so the
  theme never waits for the form's Save; its fields stay in the form but don't count as unsaved
  changes; `/household/email` bulk email (feature-gated, admins), reached from the button.
  The old `/{slug}/portal…` URLs (in emails already sent) redirect in `next.config.ts`.
  All mutations are server actions; `attempt()` turns an `ActionError` into `?err=`; flash messages
  travel as `?ok=`/`?err=` query params via `done()`/`fail()` in `lib/flash.ts` (plain
  functions, so they aren't exposed as actions), rendered by `app/components/Flash.tsx`
- `app/documents/` — household paperwork (feature-gated); everyone reads, admins manage:
  "+ Add document" in the header slot (`AddDocumentDialog`, client-direct upload), Edit per row
  (`EditDocumentDialog`; Remove confirms inside it)
- `app/trends/` — Chart.js line per bill type left on Trends (`in_trends`, set per utility in Settings; series slots from `--series-N`, HTML legend
  toggles, rebuilt on theme/scheme change), totals table with "Download CSV" on its rule (the
  whole history at `/trends/csv`; feature-gated; `lib/trends.ts` is pure, so the demo shares it)
- `app/welcome/` — the animated tour (feature-gated, on by default for a new household since
  0010), told for the household's mode. Only `/new` sends anyone there, the household's creator
  right after creating it; for everyone else the overview shows `WelcomeBanner` ("New to {household}? Take the 30-second
  tour →") until the member finishes the tour or dismisses the banner, both stamping
  `welcomed_at` through `finishWelcome`; the footer's "How this works" links it any time
- `app/(app)/new/` — the onboarding wizard (`/new`) for a new user or a new household, in the
  site's look (square choice cards for mode and theme; each theme card shows that theme's
  `ThemeSwatch`, the same one Settings' theme cards use; `STARTER_UTILITIES` as checkbox cards,
  each opening its emoji and fee while checked)
- `app/(app)/households/` — every household you're in, linked by URL (+ "start a new household").
  On these pages the site header's links and "Open your household" give way to a back link
  naming the household you came from ("← 7 Oak Lane", `homeHousehold()` in `lib/context.ts`)
- `app/(app)/admin/` — the operator's page (`/admin`, reserved; `requireSuperadmin()`,
  404 for anyone not in `SUPERADMIN_EMAILS`), on the sheet's full width, in five sections
  (`AdminSections.tsx`, a sticky list beside the content from 900px, one `<select>` on a phone;
  the open one lives in the hash: `#people`, `#households:7` flashes that row, `#email:waitlist`
  opens the compose form on the waitlist, and the actions' flash redirects carry the hash back).
  Every section is in the HTML, hidden, so a plain fetch carries all of it (the `http` suite).
  **Overview**: the four figures (households, people, bills, email this month of the plan's
  50,000 and today), "Needs attention" (empty households, deletion requests, tick errors, a
  cron quiet for 2 h or never run, failed sends), the service facts and the last 8 ISO weeks
  from `admin_weekly()`. **Households** and **People**: sortable tables (`sort.ts`,
  `SortHeader.tsx`, ported from Catamount Sublets) whose rows open in place to their members
  or facts and the typed-key delete (`DeleteForm.tsx`, a `<details>`, not the Dialog: the site
  look has none), posting `deleteHouseholdAction` / `deleteUserAction` in `actions.ts`; an
  "Email" word on a row ticks it in the compose form and goes there. **Email**: the compose
  form (`ComposeForm.tsx`, `lib/operator-mail.ts`; ARCHITECTURE.md §4 "The operator's mail")
  with the audience picked in place: everyone who has joined, some households or some people
  (a pick list unfolds under the choice, unreachable rows disabled with the reason), or the
  waitlist (0018); subject, plain-text body, an optional https button and the reply address
  (hello@ by default). "Send me a copy" previews to the operator; "Send…" confirms in the
  sheet's one `<dialog>` with the resolved count, then posts `sendOperatorNoteAction` with
  `intent=send`. Only joined, unmuted, non-operator people get it, once each; a waitlist
  address gets it once ever (`notified_at`) with a take-me-off link; past `BULK_DAILY_LIMIT`
  for the UTC day it refuses. Under the form, today's sends by kind and the week's failures
  (`MailLog.tsx`). **Waitlist**: the addresses with when they joined and were told, a copy
  field, and a button into the compose form. All from `loadAdmin()` in `lib/admin.ts`, one
  `withUser` transaction over the `admin_*` functions plus the `waitlist` table; the page
  hands the sections plain data (`types.ts`, dates as ISO strings with the server's `now`,
  `format.ts`). No links into households, no nav entry: the URL is typed. An operator account
  is operator-only (never a member; see `SUPERADMIN_EMAILS` under Configuration), so
  `homePath()` is `/admin` for it. Service updates only (no postal address in the footer, so
  nothing promotional)
- `app/(app)/account/` — your name (all households) and a calendar link per joined household
  (Sign out is in the footer); `Flash site`, `CopyField`, `CalendarLinks` and `TimezoneSelect` take site classes
  through props
- `app/(site)/login/` — the code flow in the site's look, since most sign-ins start at the
  home page's form (redirects a signed-in visitor to their household), and `signOut` (back
  to `/`)
- `/demo` — not a folder: the `[household]` routes serve the in-memory household in
  `lib/demo.ts` for the `demo` slug; data functions branch on `ctx.demo`, mutations refuse
  politely
- `app/cal.ics/route.ts` — public iCal feed per membership (`/cal.ics?k=<calendar_token>`, no
  household param), resolved through `calendar_context()` and built by `lib/ics.ts` inside
  `withHousehold` (events worded for the token's owner, rent RRULE only with `feature_rent`);
  removing the membership kills the feed, "reset my calendar link" issues a new token, and
  every bad token gets the same empty 404. Subscribe buttons: `app/components/CalendarLinks.tsx`
- `lib/features.ts` — the one place features are asked about: `hasFeature`, `requireFeature`
  (pages: not-found), `assertFeature` (actions), `navLinks` (the header)
- **Search** (Google Search Console: a Domain property, verified by the
  `google-site-verification` TXT record on uselejer.com, 2026-10-15). `app/robots.ts` and
  `app/sitemap.ts` are dynamic and outside the proxy's matcher; the sitemap lists the public
  pages and `/demo` (none while gated; live since launch). Public pages build their metadata
  with `publicPage(path, …)` (`app/metadata.ts`), which sets the canonical URL and `og:url` to
  that path
- `app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx` — `next/og` at build time
  from `BRAND` and the theme tokens (`lib/mark.tsx` holds the stand-in mark and the font loader)

### Styling

Tailwind v4, CSS-first config in `app/globals.css`. Raw values live on `:root` (the
"statement" theme: paper ledger, one accent blue, IBM Plex Mono as the ledger face) and are
mapped to utilities in `@theme inline`; `:root[data-theme="peach"]` overrides them with the
peach awning theme (cream/espresso/deep peach, Fraunces display, Karla body, Courier Prime
ledger, the `.awning` band, radii one step rounder, pill tags), `:root[data-theme="japandi"]`
with the japandi theme (linen/washi/sumi, aizome indigo as the one accent, Zen Kaku Gothic New
for body and titles, M PLUS 1 Code ledger, radii one step crisper, square tags, PAID as a
1px-ringed seal, and the noren on the same `.awning` element: a 20px indigo cloth in seigaiha
waves under a 3px oak rod, the waves from `seigaiha()` in `lib/theme-tokens.ts`), and
`:root[data-theme="sheet"]` with the public site's drafting sheet as a household theme (ink on
sheet, ink as the accent with the highlighter as its wash, Archivo and Martian Mono, radii 0,
1.5px ink frames on buttons, fields and the header, and the 24px grid on the page). The
theme list, in the order the choice cards show it, the default for a new household (`DEFAULT_THEME`
= sheet, also the column default since 0008, and the fallback with no household) and the `<html>`
attributes live in `lib/theme.ts` (`THEMES`, `themeAttrs`); the
household `template.tsx` renders `ThemeSync` on every navigation so a Settings save changes
the theme without a full load (the root layout, which sets `<html data-theme>`, never
re-renders on a client navigation). Faces come from `next/font`
(declared once in `app/theme-fonts.ts`, sheet's in `app/site-fonts.ts`) as `--nf-*` variables
on `<html>` and are picked per theme through `--face-*`; preload follows
the default theme, so only sheet's Martian Mono preloads. Japandi's two faces are self-hosted latin subsets in `app/fonts/` (`next/font/local`;
Google slices those Japanese faces into hundreds of files, see `app/fonts/README.md`).
Sheet's Archivo and Martian Mono are declared once in `app/site-fonts.ts`, which the site's
roots import too, so the build emits one file each (the `tokens` suite refuses a second
declaration); Martian Mono preloads on every root, the site included, Archivo on none.
`<html data-theme data-color-scheme>` is set by the app's root layout from the household
(every theme but statement always renders `light`). The statement dark block is gated on
`[data-color-scheme="system"][data-theme="statement"]`. Green/red/amber (sage/rose/butter in
peach, moss/persimmon/ochre in japandi, their own inked steps in sheet) are reserved for
paid/unpaid/due-soon.
Theme color values have one home, `lib/theme-tokens.ts`: email reads it directly, and the stylesheet
mirrors it under the `tokens` suite, so change the module first. Peach's values there are the
corrected spec from `DESIGN.md` (darker inks than the peach app's, all text ≥ 4.5:1), not
the peach app's originals. A global `prefers-reduced-motion` rule ends `globals.css`.
Shared component classes (`.panel`, `.eyebrow`, `.figure`, `.btn*`, `.tag*`, `.due-*`,
`.field-*`, `.data-table`, `.tab*`, `.flash*`, `.table-stack*`, `.nav-link`, `.nav-menu*`,
`.dialog`, `.legend-toggle`, `.awning`, `.panel-awning`, `.tour-*`) live in `@layer components` —
Tailwind v4 cannot `@apply` a custom class from the same layer. There is one modal,
`app/components/Dialog.tsx` (a native `<dialog>`: Escape, backdrop, focus back to the opener,
display-face title); form dialogs (bill types, editing a bill) render inside it, and anything
that removes, sends or reassigns asks first through `app/components/ConfirmButton.tsx`, built
on it, never `window.confirm()`. Status reads through `StatusTag` (Paid / Unpaid, red only once
past due) and `DueChip` (server-rendered from the household's today and urgent window).

## Verifying changes locally

Start with the two gates (`npm run build`, `npm run verify`). Pages stream under the root
`loading.tsx`, so `notFound()` renders the not-found UI with a 200 status (the status line has
already gone out); check for the UI, not the code. Dev points at the Neon `dev` branch, not production; `npm run migrate -- --seed` sets it up
(seed users `alex@example.com` / `sam@example.com`, households `elm-street` single-payer and
`oak-lane` ledger, both users in both). Set `APP_DEV_USER` / `APP_DEV_HOUSEHOLD` to skip
login. With `RESEND_API_KEY` empty, login codes print to the dev server's output
(`[mail:console] login_code to …`), so the real login flow works locally for any address.
Server actions can be driven over the wire like a no-JS browser: POST `multipart/form-data` to
the page with a `$ACTION_ID_<id>` field plus the form fields, ids from
`.next/dev/server/server-reference-manifest.json` (`exportedName`); the response is a 303 whose
`Location` carries `?ok=`/`?err=`. To tick the cron
safely, check `households.last_send_date` first; a tick past `send_hour` on a day that hasn't
sent will email real members of every household in that database.

## Deployment

Vercel (Pro, Aaron Perkel LLC team) at uselejer.com, Neon (free), two private Blob stores (dev/preview and production),
Resend (Pro since 2026-10-18: 50,000 a month, no daily cap; sending from the root domain `uselejer.com`).

**Neon** is not a Vercel marketplace integration (that integration owns `DATABASE_URL` and
would point it at the owner role, skipping RLS). Project `lejer` in the Aaron Perkel LLC org,
`aws-us-east-1`, Postgres 17; branch `main` is production, `dev` is local development.
`lejer_app` was created with SQL on `main` before `dev` was branched, so both branches have it,
each with its own password (set or reset with `ALTER ROLE`):

```sql
CREATE ROLE lejer_app LOGIN PASSWORD '<openssl rand -base64 24, URL-safe>' NOBYPASSRLS;
```

Never create it in the console (console roles join `neon_superuser`). `0001_init.sql` refuses
to run if the role is missing or can bypass RLS. Drop `channel_binding` from Neon's
connection strings; postgres.js would forward it as a startup parameter.

**Vercel** project `lejer` in the Aaron Perkel LLC (Pro) team, linked with the CLI and
connected to this GitHub repo. **Production deploys from
`main`** (cut over 2026-10-13; until then the branch was parked on a nonexistent `production`),
so every push to `main` is a production deploy: work on branches and merge by PR (Commands
above), gates first. `uselejer.com` is the
primary domain and `www.uselejer.com` a 308 to it. Previews sit behind Vercel Authentication
(keep it on: they show dev data), share the Neon `dev` branch (migrate dev before pushing a
branch that adds a migration), and send real mail from `uselejer.com` with the same
`RESEND_API_KEY` as Production (2026-10-12), so a preview's login codes arrive by email like
production's, and a preview can email any real address in the dev data. Local dev has no key
and prints mail to the console instead. Blob store `lejer-blob` (private, `iad1`) was
created with `vercel blob create-store` and is **dev/preview only, permanently**: connected to
Development and Preview, **never to Production**. Keys are
`h/{household_id}/…` and dev/preview household ids come from the Neon `dev` branch, so sharing
a store with production would let dev overwrite prod files and let `npm run verify`'s
prefix sweep delete them. Production has its **own** private store, `lejer-blob-prod`
(iad1, created 2026-10-13, connected to Production only);
`verify` keeps pinning lejer-blob by the store id embedded in the token, so it can never run
against the production store. Resend is a
direct resend.com account, not a marketplace integration.

**Vercel env vars, set by hand** in the project. Development holds the dev-branch values
(the `.env.local` recovery path above) and no `RESEND_API_KEY`. Preview holds the same dev-branch values (both
database URLs, `SESSION_SECRET`, `CRON_SECRET`, lejer-blob's token and store id) and `RESEND_API_KEY`.
Production (uses `main`) was set on 2026-10-13 (`vercel env add … production --sensitive`,
so most values can't be read back):

| Var | Value |
|---|---|
| `DATABASE_URL` | `lejer_app` on the `main` **pooled** host (`…-pooler…`), `?sslmode=require` |
| `DATABASE_URL_ADMIN` | `neondb_owner` on the `main` **unpooled** host, `?sslmode=require` |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `RESEND_API_KEY` | from the resend.com dashboard (API Keys) |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | Production: lejer-blob-prod's (connecting the store set the token; the id was added by hand). Development/Preview: lejer-blob's |
| `CRON_SECRET` | random (`openssl rand -base64 32`); Vercel Cron sends it as the bearer |
| `NEXT_PUBLIC_APP_URL` | `https://uselejer.com` |
| `LAUNCH_GATE` | unset since launch (2026-10-22); `on` (Production only) closes the site again after a redeploy |
| `SIGNIN_ALLOWLIST` | the allowlisted addresses (ignored while the gate is off) |
| `SUPERADMIN_EMAILS` | the operator's address |

`APP_DEV_USER` / `APP_DEV_HOUSEHOLD` are never set in Production (and are ignored there).
The domain uselejer.com and the GitHub repo are already connected to the Vercel project.
**uselejer.com's root MX and SPF belong to a separate mailbox provider**: Resend's records
(`resend._domainkey` DKIM, the `send.` subdomain's MX + SPF, `_dmarc`) go in beside them and
must never replace the root MX or the root SPF TXT. DMARC is `"v=DMARC1; p=none;"` with no
`rua`, deliberately (no aggregate reports wanted; added 2026-10-13).
`main` carries 0001–0019 (0019 applied 2026-11-09). After every new migration, run
`DATABASE_URL_ADMIN=<main owner URL> npm run migrate` (Node's `--env-file` never overrides a
variable already set, so the explicit one wins over `.env.local`'s dev URL; the owner URL comes
from `neonctl connection-string --branch main --role-name neondb_owner`, minus
`channel_binding`) **before merging** the branch that carries it. Plan ceilings and where they bite first are in `ARCHITECTURE.md` §10 — the one to respect is
Neon's 100 CU-hours (never ping more than hourly). Resend is Pro (50,000 a month, no daily
cap); the daily ceilings in `lib/mail-limits.ts` (1,500 overall, 1,200 for the cron, 1,000 for
bulk and operator mail, 300 sign-in codes) are the app's own safety valves against a runaway
bug, not the plan's limits.
