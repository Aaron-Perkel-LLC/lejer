import { BRAND, appUrl } from "../lib/brand";
import { householdPath } from "../lib/paths";
import type { Theme } from "../lib/types";
import { ButtonLink, Eyebrow, Heading, Paragraph, Shell } from "./Shell";

// Deleting a household (lib/deletion.ts, ARCHITECTURE.md §5): one template for each step, sent
// to the household's joined members. A request asks everyone to approve or cancel; marking says
// when it goes and that an admin can undo; cancelling, lapsing and undoing say nothing changes.
// Every step but undo points at the CSV of bills and payments, so nobody loses their records.

export type DeletionEvent = "requested" | "marked" | "cancelled" | "expired" | "undone";

export interface HouseholdDeletionProps {
  theme: Theme;
  event: DeletionEvent;
  householdName: string;
  /** The household's URL slug: links open that household (lib/paths.ts). */
  householdSlug: string;
  recipientName: string;
  /** Who did it; null for what nobody did (a request lapsing, everyone's approval completing). */
  actorName: string | null;
  /** "requested": the day the request lapses. */
  expiresOn?: string;
  /** "marked": the day the cron deletes it. */
  deleteOn?: string;
}

export function deletionSubject(p: Pick<HouseholdDeletionProps, "event" | "householdName" | "actorName" | "deleteOn">): string {
  const h = p.householdName;
  switch (p.event) {
    case "requested":
      return `${p.actorName ?? "An admin"} asked to delete ${h}`;
    case "marked":
      return `${h} will be deleted on ${p.deleteOn}`;
    case "cancelled":
      return `${p.actorName ?? "Someone"} cancelled the request to delete ${h}`;
    case "expired":
      return `The request to delete ${h} expired`;
    case "undone":
      return `${p.actorName ?? "An admin"} undid deleting ${h}`;
  }
}

export default function HouseholdDeletion(p: HouseholdDeletionProps) {
  const h = p.householdName;
  const open = appUrl(householdPath({ slug: p.householdSlug }, "/household/settings"));
  const csv = appUrl(householdPath({ slug: p.householdSlug }, "/household/export"));
  const keepCopy = (
    <Paragraph theme={p.theme} muted>
      Want your records? <a href={csv}>Download every bill and payment as a CSV</a> while {h} is still here.
    </Paragraph>
  );
  const body = {
    requested: {
      eyebrow: "Deletion requested",
      heading: `Delete ${h}?`,
      text: (
        <>
          <Paragraph theme={p.theme}>
            Hi {p.recipientName}, {p.actorName ?? "an admin"} asked to delete {h} on {BRAND.name}. It&apos;s deleted only if
            everyone who has joined approves, and any one person can cancel the request. If not everyone has approved by{" "}
            {p.expiresOn}, it lapses and nothing changes.
          </Paragraph>
          <Paragraph theme={p.theme}>
            Once everyone approves, {h} turns read-only for a week before anything is deleted, and any admin can undo it in
            that time.
          </Paragraph>
        </>
      ),
      button: "Approve or cancel",
    },
    marked: {
      eyebrow: "Scheduled for deletion",
      heading: `${h} will be deleted on ${p.deleteOn}`,
      text: (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, {p.actorName ? `${p.actorName} deleted ${h}` : `everyone approved deleting ${h}`}. It&apos;s
          read-only now, and on {p.deleteOn} every bill, payment and file in it is deleted for good. Until then any admin can
          undo it from the banner on any of its pages.
        </Paragraph>
      ),
      button: `Open ${h}`,
    },
    cancelled: {
      eyebrow: "Request cancelled",
      heading: `${h} won't be deleted`,
      text: (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, {p.actorName ?? "someone"} cancelled the request to delete {h}. Nothing changes. An admin can
          ask again any time.
        </Paragraph>
      ),
      button: `Open ${h}`,
    },
    expired: {
      eyebrow: "Request lapsed",
      heading: `${h} won't be deleted`,
      text: (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, not everyone approved deleting {h} within 14 days, so the request lapsed. Nothing changes. An
          admin can ask again any time.
        </Paragraph>
      ),
      button: `Open ${h}`,
    },
    undone: {
      eyebrow: "Deletion undone",
      heading: `${h} won't be deleted`,
      text: (
        <Paragraph theme={p.theme}>
          Hi {p.recipientName}, {p.actorName ?? "an admin"} undid deleting {h}. It&apos;s no longer scheduled for deletion, and
          everything works as before.
        </Paragraph>
      ),
      button: `Open ${h}`,
    },
  }[p.event];

  return (
    <Shell theme={p.theme} masthead={`${h} · ${BRAND.name}`} footer={BRAND.domain} preview={deletionSubject(p)}>
      <Eyebrow theme={p.theme} urgent={p.event === "requested" || p.event === "marked"}>
        {body.eyebrow}
      </Eyebrow>
      <Heading theme={p.theme}>{body.heading}</Heading>
      {body.text}
      {p.event !== "undone" && p.event !== "cancelled" && p.event !== "expired" && keepCopy}
      <ButtonLink theme={p.theme} href={open}>
        {body.button}
      </ButtonLink>
    </Shell>
  );
}

HouseholdDeletion.PreviewProps = {
  theme: "statement",
  event: "requested",
  householdName: "7 Oak Lane",
  householdSlug: "oak-lane",
  recipientName: "Sam",
  actorName: "Alex",
  expiresOn: "Monday, October 26",
} satisfies HouseholdDeletionProps;
