// Sends one real email of every template to one address, for a deliverability check
// (mail-tester.com, a seed inbox): `npm run mail:test -- someone@example.com`, or only the named
// kinds: `npm run mail:test -- someone@example.com login_code reminder`. Each template renders
// with its PreviewProps through sendMail, so what goes out is what production sends: the same
// From, the plain-text part, the sender identity in the footer and, for every mutable kind, the
// List-Unsubscribe headers (pointing at a throwaway household or user id; the link 404s, by design).
// Needs RESEND_API_KEY in .env.local (console mode otherwise prints instead) and spends one send
// per template of the day's Resend budget. Household mail goes out as the first household in the
// database (admin_households(), the operator's definer function; dev only), and is logged under it.

import { createElement } from "react";
import BatchConfirmation from "@/emails/BatchConfirmation";
import BillRemoved from "@/emails/BillRemoved";
import BulkReceipt from "@/emails/BulkReceipt";
import CustomNote from "@/emails/CustomNote";
import DigestCopy from "@/emails/DigestCopy";
import HouseholdDeletion from "@/emails/HouseholdDeletion";
import Invite from "@/emails/Invite";
import LoginCode from "@/emails/LoginCode";
import Moved from "@/emails/Moved";
import NewBill from "@/emails/NewBill";
import OperatorNote from "@/emails/OperatorNote";
import Reminder from "@/emails/Reminder";
import Thanks from "@/emails/Thanks";
import { BRAND } from "@/lib/brand";
import { withUser } from "@/lib/db";
import { type MailKind, type SendMailArgs, consoleMode, sendMail } from "@/lib/mail";
import { CATEGORY_OF, type UnsubscribeScope } from "@/lib/unsubscribe";

const to = process.argv[2];
const onlyKinds = process.argv.slice(3);
if (!to || !to.includes("@")) {
  console.error("usage: npm run mail:test -- <address> [kind ...]");
  process.exit(2);
}

type Template = ((p: object) => React.ReactElement) & { PreviewProps: object };

const MESSAGES: { kind: MailKind; subject: string; template: Template }[] = [
  { kind: "login_code", subject: `482913 is your ${BRAND.name} sign-in code`, template: LoginCode as unknown as Template },
  { kind: "invite", subject: `Alex added you to 7 Oak Lane on ${BRAND.name}`, template: Invite as unknown as Template },
  { kind: "new_bill", subject: "New bill: Electric, $25.17 your share", template: NewBill as unknown as Template },
  { kind: "bill_removed", subject: "Removed: Gas, you don't owe this one", template: BillRemoved as unknown as Template },
  { kind: "reminder", subject: "Due soon: your Electric share", template: Reminder as unknown as Template },
  { kind: "thanks", subject: "Payment recorded: Electric", template: Thanks as unknown as Template },
  { kind: "custom", subject: "Internet is switching providers", template: CustomNote as unknown as Template },
  { kind: "batch_confirmation", subject: "Reminder batch: 2 sent", template: BatchConfirmation as unknown as Template },
  { kind: "bulk_receipt", subject: "Bulk email sent: Internet is switching providers", template: BulkReceipt as unknown as Template },
  { kind: "digest", subject: "Posted: Electric, to 2 people", template: DigestCopy as unknown as Template },
  { kind: "household_deletion", subject: "Delete 7 Oak Lane?", template: HouseholdDeletion as unknown as Template },
  { kind: "moved", subject: `7 Oak Lane moved to ${BRAND.domain}`, template: Moved as unknown as Template },
  { kind: "operator_note", subject: `${BRAND.name} is open`, template: OperatorNote as unknown as Template },
  { kind: "waitlist_note", subject: `${BRAND.name} is open`, template: OperatorNote as unknown as Template },
];

/** Kinds sent with no household: account mail (login@) and the operator's (hello@). */
const NO_HOUSEHOLD = new Set<MailKind>(["login_code", "invite", "operator_note", "waitlist_note"]);

/** A throwaway scope for the kind's category: the link 404s, by design. */
function scopeFor(category: NonNullable<(typeof CATEGORY_OF)[MailKind]>, householdId: number): UnsubscribeScope {
  if (category === "updates") return { userId: 0, category };
  if (category === "waitlist") return { waitlistEmail: "nobody@example.invalid", category };
  return { householdId, membershipId: category === "digest" ? null : 0, category };
}

async function main() {
  const messages = onlyKinds.length ? MESSAGES.filter((m) => onlyKinds.includes(m.kind)) : MESSAGES;
  const unknown = onlyKinds.filter((k) => !MESSAGES.some((m) => m.kind === k));
  if (unknown.length) throw new Error(`unknown kind(s): ${unknown.join(", ")}; known: ${MESSAGES.map((m) => m.kind).join(", ")}`);
  const [h] = await withUser(null, (tx) => tx<{ id: number; name: string }[]>`SELECT id, name FROM admin_households() ORDER BY id LIMIT 1`);
  if (!h) throw new Error("no household in the database to send as");
  const ctx: NonNullable<SendMailArgs["ctx"]> = { household: { id: h.id, name: h.name, fromName: null, replyTo: null }, user: null };
  console.log(consoleMode() ? "console mode: nothing is sent (set RESEND_API_KEY in .env.local)" : `sending ${messages.length} message${messages.length === 1 ? "" : "s"} to ${to} as ${h.name}`);
  for (const m of messages) {
    const category = CATEGORY_OF[m.kind];
    const ok = await sendMail({
      ctx: NO_HOUSEHOLD.has(m.kind) ? undefined : ctx,
      to,
      subject: m.subject,
      react: createElement(m.template, m.template.PreviewProps),
      kind: m.kind,
      ...(category ? { unsubscribe: scopeFor(category, h.id) } : {}),
    });
    console.log(`${ok ? "sent" : "FAILED"}  ${m.kind.padEnd(20)} ${m.subject}`);
    await new Promise((r) => setTimeout(r, 600)); // under Resend's 2 req/s
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
