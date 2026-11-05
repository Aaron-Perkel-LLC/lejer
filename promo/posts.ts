// The posts: which images go out together, and the words that go with them. `npm run promo`
// builds one folder per post under promo/out/posts/{instagram,linkedin}/, holding the images
// in posting order, caption.txt (paste as is), alt-text.txt (one line per image) and, where
// there's something to do besides paste, notes.txt. A LinkedIn post with `pdf` also gets the
// images as one PDF, which LinkedIn shows as a swipeable document carousel.
//
// Figures and claims stay true to the app and SURVEY-RESULTS.md: free, no ads, no card, never
// moves money; no Venmo/Zelle links (they don't exist yet).

import { BRAND } from "@/lib/brand";
import { CAROUSELS, HEADLINE, type Stage } from "./copy";

export interface Post {
  platform: "instagram" | "linkedin";
  /** Folder name: stage, order, what it is. */
  slug: string;
  /** Canvas names (promo/out/<name>.png), in posting order. */
  images: string[];
  caption: string;
  notes?: string;
  /** LinkedIn document post: the images as one PDF, with the title LinkedIn asks for. */
  pdf?: { title: string };
}

const N = BRAND.name;
const D = BRAND.domain;
const TAGS = "#roommates #splittingbills #firstapartment #householdbills #studentliving";

const slides = (stage: Stage) => CAROUSELS[stage].map((_, i) => `${stage}/ig-carousel-${i + 1}`);

/** Alt text for every canvas a post uses. */
export function altText(name: string): string {
  const carousel = name.match(/^(soon|launch)\/ig-carousel-(\d+)$/);
  if (carousel) {
    const s = CAROUSELS[carousel[1] as Stage][Number(carousel[2]) - 1];
    const figure = s.mark === "paid" ? `${s.figure}, struck through` : s.figure;
    return `Slide ${carousel[2]} of 6 on a gridded drafting sheet. Large figure: ${figure} (${s.sub}). Headline: ${s.title} ${s.body}`;
  }
  const stage = name.startsWith("soon/") ? "Coming soon" : "Now open";
  const shares =
    "$26.03 owed to Jordan for electric, $15.60 to Casey for gas, $10.79 to Morgan for water, and $60.00 owed back for wifi";
  const phones =
    "Two phones showing a sample household: the overview (you owe $26.39, next due Oct 18, 4 bills on record) and the bills list with a checkbox for each roommate's share";
  const base = name.replace(/^(soon|launch)\//, "");
  switch (base) {
    case "ig-post":
    case "ig-story":
      return `${N}, ${stage}. Headline: ${HEADLINE} Four share cards, each under a colored utility line: ${shares}. ${D}`;
    case "linkedin":
      return `${N}, ${stage}. Headline: ${HEADLINE} Two share cards: $26.03 owed to Jordan for electric, and $60.00 owed back for wifi. ${D}`;
    case "phones":
    case "linkedin-phones":
      return `${N}, ${stage}. Headline: ${HEADLINE} ${phones}. ${D}`;
    case "ig-story-phone":
      return `${N}, ${stage}. Headline: ${HEADLINE} A phone showing a sample household's overview: you owe $26.39, next due Oct 18. ${D}`;
    case "overview":
      return `${N} in a browser window, a sample household's overview: you owe $26.39, owed to you on wifi, what you owe on gas and water, and the house ledger of who owes whom.`;
  }
  throw new Error(`altText: no alt text for ${name}`);
}

const STORY_NOTES = (sticker: string) =>
  `Stories take no caption. Post the frames in order. On each, add a link sticker to https://${D} reading "${sticker}", placed in the lower third but above the reply bar (the bottom ~280 px of the image is kept clear for it). The top ~220 px is kept clear for Instagram's own header.`;

export const POSTS: Post[] = [
  // ---------- Instagram, before opening ----------
  {
    platform: "instagram",
    slug: "soon-1-carousel",
    images: slides("soon"),
    caption: `Who's fronting the bills in your house?

Somebody covers the electric, then spends the month chasing everyone for their share. ${N} is one shared record for that: post the bill with its PDF, everyone sees their share, you check off who's paid you back, and reminders do the nagging.

Free, no ads, and it never touches your money. Pay each other however you already do.

Opening soon. Join the list at ${D} (link in bio) and you'll get one email the day it opens.

${TAGS}`,
    notes: `Six images, post as one carousel in this order. Put ${D} in your bio link before posting.`,
  },
  {
    platform: "instagram",
    slug: "soon-2-first-look",
    images: ["soon/phones"],
    caption: `A first look. This is ${N} on a phone, with a sample household: what you owe, what you're owed, and who to pay, plus every bill with a checkbox for each roommate.

It opens soon. Join the list at ${D} (link in bio) to hear the day it does.

${TAGS}`,
  },
  {
    platform: "instagram",
    slug: "soon-3-shares",
    images: ["soon/ig-post"],
    caption: `Four bills, four shares, one record. No spreadsheet, no group-chat math.

Coming soon to ${D}. Link in bio to join the list.

${TAGS}`,
  },
  {
    platform: "instagram",
    slug: "soon-story",
    images: ["soon/ig-story-phone", "soon/ig-story"],
    caption: "",
    notes: STORY_NOTES("Join the list"),
  },

  // ---------- Instagram, launch day ----------
  {
    platform: "instagram",
    slug: "launch-1-announcement",
    images: ["launch/ig-post"],
    caption: `${N} is open.

${HEADLINE} Whoever gets the bill posts it with the statement. Everyone sees their share, gets a reminder before it's due, and checks it off once they've paid.

Free, with no ads and no card, and it never moves money. Start your household at ${D} (link in bio) and invite your roommates by email. If you joined the list, your email is on its way.

${TAGS}`,
  },
  {
    platform: "instagram",
    slug: "launch-2-carousel",
    images: slides("launch"),
    caption: `How a month goes in ${N}, in six slides.

Post the bill, everyone sees their share, and it works whether one person pays everything or each bill has its own owner. Check it off once you've paid, however you paid.

Free at ${D} (link in bio).

${TAGS}`,
    notes: "Six images, post as one carousel in this order.",
  },
  {
    platform: "instagram",
    slug: "launch-3-screens",
    images: ["launch/phones", "launch/overview"],
    caption: `What it looks like, on your phone and on a laptop, with a sample household.

Want to click around first? There's a demo at ${D}/demo, no account needed.

${TAGS}`,
    notes: "Two images, post as one carousel.",
  },
  {
    platform: "instagram",
    slug: "launch-story",
    images: ["launch/ig-story-phone", "launch/ig-story"],
    caption: "",
    notes: STORY_NOTES("Open now"),
  },

  // ---------- LinkedIn, before opening ----------
  {
    platform: "linkedin",
    slug: "soon-1-announcement",
    images: ["soon/linkedin-phones"],
    caption: `Last week, 22 of you answered my survey about splitting house bills. Thank you. Two things stood out:

• Two-thirds said one person pays everything and sends Venmo requests.
• The people who feel the hassle most are the ones who'd use a tool for it.

So that's who I'm building ${N} for: the person in the house who fronts the bills.

You post each bill with its PDF. Everyone sees their share, gets a reminder before it's due, and checks it off once they've paid. If each roommate owns a different bill, it shows who owes whom instead. It's free, it has no ads, and it never touches the money: you pay each other however you already do.

It opens soon. If you'd like to hear the day it does, visit ${D} and join the list. One email, that's it.`,
  },
  {
    platform: "linkedin",
    slug: "soon-2-first-look",
    images: ["soon/phones"],
    caption: `A first look at ${N} on a phone, with a sample household.

The overview answers three questions at a glance: what do I owe, what am I owed, and who do I pay. Bills keeps every statement, with a checkbox for each roommate's share.

Opening soon. Join the list at ${D} to get one email the day it opens.`,
  },
  {
    platform: "linkedin",
    slug: "soon-3-carousel",
    images: slides("soon"),
    pdf: { title: `How ${N} works, in six slides` },
    caption: `Who's fronting the bills in your house? Six slides on how ${N} takes the chasing out of it.

Opening soon. Join the list at ${D}.`,
    notes: `Post carousel.pdf as a document (Add a document), not the PNGs; LinkedIn asks for a title: use the one in pdf-title.txt.`,
  },

  // ---------- LinkedIn, launch day ----------
  {
    platform: "linkedin",
    slug: "launch-1-announcement",
    images: ["launch/linkedin-phones"],
    caption: `${N} is open.

It's a shared record for the bills you split with the people you live with. Whoever gets the bill posts it with the statement. Everyone sees their share, gets a reminder before it's due, and checks it off once they've paid. One person can pay everything, or each bill can have its own owner; it works either way.

It's free, with no ads and no card, and it never moves money.

Thank you to everyone who answered the survey and joined the list. Start your household at ${D}, or look around the demo first at ${D}/demo.`,
  },
  {
    platform: "linkedin",
    slug: "launch-2-screens",
    images: ["launch/phones", "launch/overview"],
    caption: `What ${N} looks like, on a phone and on a laptop, with a sample household.

Free at ${D}. The demo at ${D}/demo needs no account.`,
    notes: "Two images in one post.",
  },
  {
    platform: "linkedin",
    slug: "launch-3-carousel",
    images: slides("launch"),
    pdf: { title: `How a month goes in ${N}` },
    caption: `How a month of house bills goes in ${N}, in six slides. Free at ${D}.`,
    notes: `Post carousel.pdf as a document (Add a document), not the PNGs; LinkedIn asks for a title: use the one in pdf-title.txt.`,
  },
];
