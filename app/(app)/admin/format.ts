// Dates, counts and the names of things on the admin page. Times are UTC and say so: the send
// ceilings are per UTC day and the cron stamps in UTC, so the operator reads one clock.

export const fmtDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";

export const fmtDay = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export const fmtWhen = (iso: string | null | undefined): string =>
  iso ? `${new Date(iso).toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} UTC` : "";

/** "just now", "12 min ago", "3 h ago", "2 d ago", then the date. `now` is the server's, so both renders agree. */
export function ago(iso: string | null | undefined, now: string): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return fmtDate(iso);
}

export const count = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const num = (n: number): string => n.toLocaleString("en-US");

/** email_log kinds (lib/mail-kinds.ts) as the operator reads them. */
const KIND_LABEL: Record<string, string> = {
  login_code: "Sign-in codes",
  invite: "Invites",
  new_bill: "New bills",
  bill_updated: "Corrections",
  bill_removed: "Removals",
  reminder: "Reminders",
  thanks: "Receipts",
  custom: "Household notes",
  batch_confirmation: "Batch confirmations",
  bulk_receipt: "Bulk receipts",
  digest: "Digest copies",
  household_deletion: "Deletion mail",
  moved: "Moved notices",
  operator_note: "Your notes",
  waitlist_note: "Waitlist notes",
};
export const kindLabel = (kind: string): string => KIND_LABEL[kind] ?? kind;

export const modeLabel = (mode: string): string => (mode === "single_payer" ? "one payer" : "ledger");
