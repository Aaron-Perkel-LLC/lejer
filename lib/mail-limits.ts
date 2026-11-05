// The send ceilings (ARCHITECTURE.md §6), in a module with no server imports so client
// components can read them; lib/mail.ts re-exports them. Resend Pro (since 2026-10-18) allows
// 50,000 sends a month with no daily cap, so these are the app's own safety valves, sized to a
// day's share of the month with room to spare: a runaway bug (a reminder loop, a stuck queue)
// stops well short of the quota, and nothing a real month does gets near them.
/** Resend Pro's monthly quota, account-wide. The admin page shows the month against it. */
export const RESEND_MONTHLY_QUOTA = 50_000;
/** The app's own ceiling for one UTC day. */
export const EMAIL_DAILY_CEILING = 1_500;
/** The cron defers a reminder batch that would push the day past this. */
export const CRON_DAILY_LIMIT = 1_200;
/** Bulk email and the operator's notes are optional and reminders aren't, so they stop earlier. */
export const BULK_DAILY_LIMIT = 1_000;
/** Sign-in codes per UTC day, account-wide (lib/login-codes.ts). */
export const LOGIN_DAILY_LIMIT = 300;
