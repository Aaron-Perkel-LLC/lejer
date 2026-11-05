// The kinds of email the app sends, one per email_log row. In their own module so
// lib/unsubscribe.ts can name them without importing lib/mail.ts (which imports it back).
export type MailKind =
  | "login_code"
  | "invite"
  | "new_bill"
  | "bill_updated"
  | "bill_removed"
  | "reminder"
  | "thanks"
  | "custom"
  | "batch_confirmation"
  | "bulk_receipt"
  | "digest"
  | "household_deletion"
  | "moved" // a household imported from an old site: where it lives now (scripts/send-moved.ts)
  | "operator_note" // the operator's note about the service, from /admin (lib/operator-mail.ts)
  | "waitlist_note"; // the same note to the launch waitlist (0018), with a take-me-off link instead
