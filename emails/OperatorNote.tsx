import { BRAND } from "../lib/brand";
import { ButtonLink, Heading, Paragraph, Prose, Shell, type UnsubscribeLink } from "./Shell";

// The operator's note about the service, composed on /admin (lib/operator-mail.ts): to one
// household's members, to picked people, to everyone who has joined, or to the launch waitlist
// (then with no name to greet, and a take-me-off link in place of the unsubscribe). No household,
// so it wears the statement shell. Read as a letter: the product's name once, in the masthead
// (it is also the From name); no eyebrow, the subject is the heading; the footer carries the
// reply address and the legal line, not the domain again. Mutable: `updates` (or `waitlist`) in
// lib/unsubscribe.ts, so sendMail passes the link.

export interface OperatorNoteProps {
  /** Set by sendMail; see Shell. */
  unsubscribe?: UnsubscribeLink;
  /** Null for a waitlist address, which has no account and no name. */
  recipientName: string | null;
  subject: string;
  /** The operator's own words; a blank line starts a paragraph. */
  body: string;
  /** One optional button under the text. */
  link?: { label: string; url: string } | null;
  /** The reply address, shown in the footer. */
  contact: string;
}

export default function OperatorNote(p: OperatorNoteProps) {
  const theme = "statement" as const;
  return (
    <Shell theme={theme} masthead={BRAND.name} contact={p.contact} unsubscribe={p.unsubscribe} preview={p.body.slice(0, 140)}>
      <Heading theme={theme}>{p.subject}</Heading>
      <Paragraph theme={theme}>{p.recipientName ? `Hi ${p.recipientName},` : "Hi there,"}</Paragraph>
      <Prose theme={theme} text={p.body} />
      {p.link && (
        <ButtonLink theme={theme} href={p.link.url}>
          {p.link.label}
        </ButtonLink>
      )}
      <Paragraph theme={theme} muted top>
        Reply to this email with any questions.
      </Paragraph>
    </Shell>
  );
}

OperatorNote.PreviewProps = {
  recipientName: "Alex",
  subject: `${BRAND.name} is open`,
  body: `The waitlist is over: anyone can sign up now, so invite the people you split with.\n\nNothing changes for your household. Same bills, same reminders.`,
  link: { label: `Open ${BRAND.name}`, url: BRAND.url },
  contact: BRAND.contactEmail,
} satisfies OperatorNoteProps;
