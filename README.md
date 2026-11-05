# Lejer

Free bill-splitting for people who share a lease. A household signs up, invites its roommates
by email, posts each utility bill (optionally with the provider's PDF), and Lejer keeps the
record of who owes whom, sends reminders before bills are due, and gives every member a
calendar feed of due dates. It never moves money: people pay however they already do, and the
person who fronted the bill checks them off.

Two modes share one data model: **single payer** (one person fronts every bill and everyone
owes them) and **ledger** (each bill type has its own owner, and debts run to that bill's
owner).

Live at [uselejer.com](https://uselejer.com), with a demo household at
[uselejer.com/demo](https://uselejer.com/demo) that needs no account.

## Stack

- Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind CSS v4
- Postgres on Neon through [postgres.js](https://github.com/porsager/postgres): raw SQL, no ORM
- Vercel for hosting, Blob (private store) for bill PDFs and documents, Cron for the hourly
  tick, and Queues for a delayed ten-minute wake-up
- Resend for mail, with templates written as React Email components
- jose for the session token, Chart.js for the trends page

## Architecture highlights

`ARCHITECTURE.md` records every decision and why; `CLAUDE.md` is the working reference for the
code. In short:

- **Row-level security per household.** Every tenant table carries `household_id` and has RLS
  enabled. App code connects as `lejer_app`, a role created `NOBYPASSRLS` (the first migration
  refuses to run otherwise), and all tenant SQL goes through `withHousehold()` in `lib/db.ts`,
  which opens a transaction and sets `app.household_id` / `app.user_id` with
  `set_config(..., true)` first. Policies compare against those settings, so a missing setting
  matches nothing. Child tables use composite foreign keys `(parent_id, household_id)`, so a
  row can never point into another household. The table-owner connection is limited to five
  named call sites: the migration and import scripts, household creation, the cron's household
  list and the reminders CLI.
- **Email-code sign-in.** No passwords. A 6-digit code is stored only as a SHA-256 hash, expires
  after 10 minutes and dies after 5 wrong guesses. Requests are limited per email (burst dedupe
  and a cap per window), per IP (the IP is stored only as a hash) and by a global daily ceiling
  (`lib/login-codes.ts`, `lib/mail-limits.ts`).
- **Session.** A 30-day HS256 JWT in an HTTP-only cookie that carries only the user id. The
  household comes from the URL (`/{slug}/…`) and is authorized by membership on every request;
  a non-member gets not-found, so a slug never confirms a household exists.
- **Reminders on the household's clock.** A Vercel Cron Job hits `/api/cron/tick` hourly
  (bearer `CRON_SECRET`). Each household sends at most once a day, on the first tick at or after
  its own send hour in its own timezone, claimed with an atomic compare-and-set so a retried or
  overlapping tick can't double-send. Daily send ceilings defer a batch rather than exceed them.
- **Private files.** Bill PDFs and documents live in a private Blob store under
  `h/{household_id}/…`. `app/files/[...path]/route.ts` is the only way to read one: it checks
  membership of the household the key names, confirms the key is on record inside an RLS
  transaction, applies an extension allowlist and streams the file.
- **Hand-written SQL migrations.** Numbered files in `db/migrations/`, applied in order by
  `scripts/migrate.ts` and tracked in `schema_migrations`.
- **Verify suites.** `scripts/verify/` holds suites for RLS, identity, bills, cron, email,
  deletion, the operator page, HTTP behavior over a real `next start`, and more. They build
  their own throwaway households and delete them afterwards, and they refuse to run against
  anything but the development database branch and Blob store.

## Running locally

Prerequisites: Node.js 22 or later, a Postgres database reachable over TLS (the project uses
Neon, Postgres 17), and, for bill PDFs and documents, a private Vercel Blob store.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (`.env.example` documents every key):

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Pooled connection as the `lejer_app` role. All app code uses it; RLS applies. |
| `DATABASE_URL_ADMIN` | Direct connection as the table owner. Migrations and a few named call sites only. |
| `SESSION_SECRET` | Key that signs the session cookie and unsubscribe links (`openssl rand -base64 32`). |
| `RESEND_API_KEY` | Leave empty locally: mail (login codes included) is printed to the dev server's console instead of sent. |
| `RESEND_TEST_SENDER` | Optional: send from Resend's test address when your key's domain isn't verified. |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | The private Blob store for PDFs and documents. |
| `CRON_SECRET` | Bearer token the cron route requires. |
| `NEXT_PUBLIC_APP_URL` | Base URL for absolute links in email and the calendar feed (`http://localhost:3000`). |
| `LAUNCH_GATE`, `SIGNIN_ALLOWLIST` | Optional pre-launch gate; leave empty for an open site. |
| `SUPERADMIN_EMAILS` | Optional: addresses that may open the operator page at `/admin`. |
| `APP_DEV_USER`, `APP_DEV_HOUSEHOLD` | Optional: skip sign-in as that email in that household (ignored in production). |

Create the app role once, as the database owner, before the first migration:

```sql
CREATE ROLE lejer_app LOGIN PASSWORD '<random>' NOBYPASSRLS;
```

Then apply the migrations, seed two sample households, and start the dev server:

```bash
npm run migrate -- --seed   # applies db/migrations/*.sql, then loads db/seed.sql
npm run dev
```

The seed creates `elm-street` (single payer) and `oak-lane` (ledger), with users
`alex@example.com` and `sam@example.com` in both. Sign in with either address (the code
appears in the dev server's output), or set `APP_DEV_USER` / `APP_DEV_HOUSEHOLD` to skip
sign-in.

Other scripts: `npm run email:dev` previews the email templates, and `npm run send-reminders --
--household <slug>` runs one household's reminders from the command line.

### Checks

```bash
npm run build    # typecheck and production build
npm run verify   # every suite in scripts/verify/, or name some: npm run verify -- rls identity
```

`verify` runs against a real database and Blob store, so it is deliberately strict about
which: `scripts/verify/harness.ts` pins the Neon project, branch and endpoint and the Blob store
it accepts, and it refuses to start otherwise. To run it against your own development branch,
change those pins. It also needs both database URLs, `BLOB_READ_WRITE_TOKEN` and
`SESSION_SECRET`, and the `http` suite serves the output of the last `npm run build`, so build
first.

## License

Source available for viewing; all rights reserved. See [LICENSE](LICENSE).
