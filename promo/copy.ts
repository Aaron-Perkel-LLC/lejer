// Every word on the promo images, in one place. Edit here, then `npm run promo`.
// Figures come from the /demo household (lib/demo.ts) so the images match what a visitor
// sees when they open the demo: Electric $104.12 fronted by Jordan, split four ways.
// Two stages: "soon" (before opening: join the list for the launch email) and "launch".

import { BRAND } from "@/lib/brand";

export type Stage = "soon" | "launch";

export const HEADLINE = "Every house bill, split and on the record.";

export const STAGES: Record<Stage, { key: string; lede: string; foot: string; cta: string }> = {
  soon: {
    key: "Coming soon",
    lede: `Visit ${BRAND.domain} today and join the list. You'll get one email the day it opens.`,
    foot: "Join the list for launch day",
    cta: "Join the list",
  },
  launch: {
    key: "Now open",
    lede: "Whoever gets the bill posts it. Everyone sees their share, gets a reminder before it's due, and checks it off once they've paid.",
    foot: "Free · no ads · no card · never moves money",
    cta: "Sign up with your email",
  },
};

/**
 * The four utility lanes the lane pieces draw, one share chip each, seen by Robin (the
 * demo's viewer): three shares Robin owes, and Wifi, which Robin fronts (the owner's chip,
 * ruled in its line's color, as on the site's plan).
 */
export const LANES = [
  { util: "electric", name: "Electric", total: 104.12, figure: 26.03, caption: "you owe Jordan · due Oct 19", owner: false },
  { util: "gas", name: "Gas", total: 62.4, figure: 15.6, caption: "you owe Casey · due Oct 18", owner: false },
  { util: "water", name: "Water", total: 43.16, figure: 10.79, caption: "you owe Morgan · due Nov 1", owner: false },
  { util: "wifi", name: "Wifi", total: 79.99, figure: 60.0, caption: "you fronted it · owed back", owner: true },
] as const;

export type Util = (typeof LANES)[number]["util"];

/**
 * A carousel slide. `figure` is the loudest thing on it, `sub` its caption, `util` the locate
 * line drawn with it (several are drawn stacked, the last dropping into the chip). `mark` is
 * what the chip wears: an open box (a share still owed), a checked box with the paid strike,
 * or the owner's rule in the line's color.
 */
export interface Slide {
  key: string;
  figure: string;
  sub: string;
  util?: Util | Util[];
  mark?: "box" | "paid" | "owner";
  title: string;
  body: string;
}

export const CAROUSELS: Record<Stage, Slide[]> = {
  // Before opening: the six lines as written, the last one pointing at the list.
  soon: [
    {
      key: "Coming soon",
      figure: "$104.12",
      sub: "Electric · Jordan fronted it",
      util: "electric",
      mark: "owner",
      title: "Who's fronting the bills in your house?",
      body: "Someone covers the electric, then waits to get paid back. Swipe for an easier way.",
    },
    {
      key: "01 · Post it",
      figure: "$104.12",
      sub: "Electric · statement.pdf attached",
      util: "electric",
      title: "Post the bill, attach the PDF.",
      body: "Whoever gets the bill posts it, so anyone in the house can check the math.",
    },
    {
      key: "02 · Split it",
      figure: "$26.03",
      sub: "$104.12 ÷ 4 roommates",
      util: "electric",
      mark: "box",
      title: "Everyone sees their share.",
      body: "Who splits a bill is set when it's posted, so a roommate who moves in later never owes on it.",
    },
    {
      key: "03 · Paid back",
      figure: "$26.03",
      sub: "Casey paid you back",
      util: "electric",
      mark: "paid",
      title: "Check off who's paid you back.",
      body: "Pay however you already do: Venmo, cash, a bank transfer. It records that it happened and never moves money.",
    },
    {
      key: "04 · Reminders",
      figure: "Oct 19",
      sub: "due date · the reminder goes out Oct 16",
      util: "electric",
      title: "Reminders handle the nagging.",
      body: "They go out on the house's schedule, so nobody has to be the one who asks.",
    },
    {
      key: "Coming soon",
      figure: "$0.00",
      sub: "free · no ads · no card",
      title: "Free, and opening soon.",
      body: `Visit ${BRAND.domain} today and join the list. You'll get one email the day it opens.`,
    },
  ],
  launch: [
    {
      key: "Splitting bills?",
      figure: "$26.03",
      sub: "your share of Electric · due Oct 19",
      util: "electric",
      mark: "box",
      title: HEADLINE,
      body: "No spreadsheet, no group-chat math. Swipe to see how a month goes.",
    },
    {
      key: "01 · Post it",
      figure: "$104.12",
      sub: "Electric · statement.pdf attached",
      util: "electric",
      title: "Whoever gets the bill posts it.",
      body: "Attach the provider's PDF, so anyone in the house can check the math later.",
    },
    {
      key: "02 · Split it",
      figure: "$26.03",
      sub: "$104.12 ÷ 4 roommates",
      util: "electric",
      mark: "box",
      title: "Everyone sees their share.",
      body: "Who splits a bill is set when it's posted, so a roommate who moves in later never owes on it.",
    },
    {
      key: "03 · Either way",
      figure: "$72.42",
      sub: "you owe Robin, across 4 bills",
      util: ["electric", "gas", "water", "wifi"],
      title: "One person pays, or each bill has an owner.",
      body: "If one roommate covers everything, you see one number. If bills are spread around, you see who owes whom.",
    },
    {
      key: "04 · Check it off",
      figure: "$26.03",
      sub: "paid Jordan",
      util: "electric",
      mark: "paid",
      title: "A reminder before it's due. A check once it's paid.",
      body: "Pay however you already do: Venmo, cash, a bank transfer. It records that it happened and never moves money.",
    },
    {
      key: "Start your household",
      figure: "$0.00",
      sub: "free · no ads · no card",
      title: "Invite your roommates by email.",
      body: "Private to your household. Every due date lands in your own calendar.",
    },
  ],
};

/** The device-frame pieces. */
export const SCREENS = {
  overview: { key: "The overview", title: "What you owe, what you're owed, and who to pay." },
  phones: { key: "On your phone", title: "Check off a share from wherever you paid it." },
};
