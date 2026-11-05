import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Rows, Shell } from "./Shell";

// "{Household} is now on {BRAND.name}": sent once to every member of a household imported from
// one of the old single-household sites (scripts/send-moved.ts, ARCHITECTURE.md §11). It tells
// them the three things that changed for them: the address, how to sign in, and the calendar
// link. Transactional (no unsubscribe): it's the one notice about the move.

export interface MovedProps {
  theme: Theme;
  householdName: string;
  /** The household's URL slug (lib/paths.ts). */
  householdSlug: string;
  recipientName: string;
  /** The address they sign in with, the same one the old site knew. */
  email: string;
  /** The old site's host, e.g. "peachcob.vercel.app". */
  oldHost: string;
  /** The reply address, shown in the footer (BRAND.contactEmail unless the sender says otherwise). */
  contact: string;
}

export default function Moved(p: MovedProps) {
  const home = householdPath({ slug: p.householdSlug });
  const signIn = appUrl(`/login?${new URLSearchParams({ email: p.email, next: home })}`);
  return (
    <Shell
      theme={p.theme}
      masthead={`${p.householdName} · ${BRAND.name}`}
      footer={BRAND.domain}
      contact={p.contact}
      preview={`${p.householdName} moved from ${p.oldHost} to ${BRAND.domain}. Same bills, same email to sign in.`}
    >
      <Eyebrow theme={p.theme}>The house moved</Eyebrow>
      <Heading theme={p.theme}>
        {p.householdName} is now on {BRAND.name}
      </Heading>
      <Paragraph theme={p.theme}>
        Hi {p.recipientName}, the house ledger has a new home. Everything from {p.oldHost} came over: every bill,
        who still owes what, and the reminder schedule. The old address now just points here.
      </Paragraph>
      <Rows
        theme={p.theme}
        rows={[
          { label: "New address", value: `${BRAND.domain}${home}`, strong: true },
          { label: "Sign in with", value: p.email },
          { label: "Mail comes from", value: BRAND.notifyFrom },
        ]}
      />
      <Paragraph theme={p.theme}>
        <strong>Signing in</strong> works the way it did: enter {p.email} and a one-time code is emailed to you. No
        password.
      </Paragraph>
      <Paragraph theme={p.theme}>
        <strong>Your calendar</strong> needs re-adding. The old site&apos;s calendar link has stopped updating; open{" "}
        <strong>Account</strong> on the new site for a fresh one.
      </Paragraph>
      <Paragraph theme={p.theme}>
        <strong>Reminders and new-bill emails</strong> now come from &ldquo;{p.householdName} via {BRAND.name}&rdquo;, so
        check spam the first time one arrives.
      </Paragraph>
      <ButtonLink theme={p.theme} href={signIn}>
        Open {p.householdName}
      </ButtonLink>
      <Paragraph theme={p.theme} muted top>
        Reply to this email with any questions.
      </Paragraph>
    </Shell>
  );
}

Moved.PreviewProps = {
  theme: "peach",
  householdName: "7 Oak Lane",
  householdSlug: "oak-lane",
  recipientName: "Alex",
  email: "alex@example.com",
  oldHost: "oaklane.example.com",
  contact: "sam@example.com",
} satisfies MovedProps;
