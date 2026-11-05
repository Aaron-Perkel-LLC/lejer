import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell, type UnsubscribeLink, longDate, money } from "./Shell";

// A payment reminder for one debtor on one bill: the per-bill button on the bills page (phase 3) and
// the daily cron batch (phase 4). Urgent when the bill is within the household's urgent window
// or overdue. Reply-To is the bill's owner (set by the caller). With `provider`, it is the
// owner's own reminder instead (0017): the bill hasn't been marked paid to the provider, so it
// names the total and no one to pay.

export interface ReminderProps {
  theme: Theme;
  /** Set by sendMail; see Shell. */
  unsubscribe?: UnsubscribeLink;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  recipientName: string;
  typeName: string;
  total: number;
  perPersonCost: number;
  dueDate: string;
  ownerName: string | null;
  urgent: boolean;
  /** Past its due date (urgent too). */
  overdue?: boolean;
  /** To the bill's owner, about paying the provider, rather than to a debtor about their share. */
  provider?: boolean;
}

export default function Reminder(p: ReminderProps) {
  const due = longDate(p.dueDate);
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain} unsubscribe={p.unsubscribe}
      preview={
        p.provider
          ? `${p.typeName}: $${money(p.total)} to the provider, due ${due}.`
          : `${p.typeName}: your share $${money(p.perPersonCost)}${p.ownerName ? ` to ${p.ownerName}` : ""}, due ${due}.`
      }
    >
      <Eyebrow theme={p.theme} urgent={p.urgent}>
        {p.overdue ? "Past due" : p.urgent ? "Due soon" : "Payment reminder"}
      </Eyebrow>
      <Heading theme={p.theme}>
        {p.typeName} bill {p.overdue ? "was due" : "due"} {due}
      </Heading>
      {p.provider ? (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, the {p.typeName} bill hasn&apos;t been marked paid to the provider yet. Once it is, tick it off in{" "}
          {p.householdName} and these reminders stop.
        </Paragraph>
      ) : (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, your share of the {p.typeName} bill is still open
          {p.ownerName ? `. ${p.ownerName} paid the provider, so send it their way.` : "."}
        </Paragraph>
      )}
      <Rows
        theme={p.theme}
        rows={
          p.provider
            ? [
                { label: "Bill", value: p.typeName },
                { label: "Total", value: `$${money(p.total)}`, strong: true },
                { label: "Due", value: due, urgent: p.urgent },
              ]
            : [
                { label: "Bill", value: p.typeName },
                { label: "Statement total", value: `$${money(p.total)}` },
                { label: "Your share", value: `$${money(p.perPersonCost)}`, strong: true },
                ...(p.ownerName ? [{ label: "Pay to", value: p.ownerName }] : []),
                { label: "Due", value: due, urgent: p.urgent },
              ]
        }
      />
      <ButtonLink theme={p.theme} href={appUrl(householdPath({ slug: p.householdSlug }))}>
        Open {p.householdName}
      </ButtonLink>
    </Shell>
  );
}

Reminder.PreviewProps = {
  theme: "statement",
  householdName: "12 Elm Street",
  householdSlug: "elm-street",
  recipientName: "Sam",
  typeName: "Electric",
  total: 50.33,
  perPersonCost: 25.17,
  dueDate: "2026-10-09",
  ownerName: "Alex",
  urgent: true,
} satisfies ReminderProps;
