// npm run mail:moved -- --household-id <id> --old-host <host> (--to <address> | --everyone) [--as <member email>] [--reply-to <address>]
//
// The one notice to a household imported from an old site (emails/Moved.tsx, ARCHITECTURE.md
// §11): where it lives now, how to sign in, the calendar. `--to` sends one copy to that address
// (a review copy, personalized as `--as` or the first member); `--everyone` sends each joined
// member their own. Replies go to BRAND.contactEmail unless `--reply-to` says otherwise.
// Runs as lejer_app inside withHousehold, so DATABASE_URL must be the branch
// that holds the household (production's pooled URL for the real thing), and it refuses to send
// links that don't point at the production site (local .env.local sets NEXT_PUBLIC_APP_URL to
// localhost; pass the real one on the command line). Real mail needs RESEND_API_KEY; without it
// the message prints (console mode), which is the preview.

import { createElement } from "react";
import Moved from "@/emails/Moved";
import { BRAND, appUrl } from "@/lib/brand";
import { withHousehold } from "@/lib/db";
import { getCurrentHousehold } from "@/lib/households";
import { normalizeEmail } from "@/lib/login-codes";
import { consoleMode, sendMail } from "@/lib/mail";

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const householdId = Number(opt("--household-id"));
const oldHost = opt("--old-host");
const replyTo = normalizeEmail(opt("--reply-to") ?? BRAND.contactEmail);
const to = opt("--to") ? normalizeEmail(opt("--to")) : null;
const everyone = args.includes("--everyone");
const as = opt("--as") ? normalizeEmail(opt("--as")) : null;
if (!householdId || !oldHost || !replyTo || (!to && !everyone) || (to && everyone)) {
  console.error("usage: npm run mail:moved -- --household-id <id> --old-host <host> (--to <address> | --everyone) [--as <member email>] [--reply-to <address>]");
  process.exit(2);
}
if (appUrl("/login") !== `${BRAND.url}/login`) {
  console.error(`refusing: links would point at ${appUrl("/login")}, not ${BRAND.url}/login (set NEXT_PUBLIC_APP_URL=${BRAND.url} on the command line)`);
  process.exit(2);
}

interface Member {
  name: string;
  email: string;
}

async function main() {
  const scope = { household: { id: householdId }, user: null };
  const { household, members } = await withHousehold(scope, async (tx) => {
    const household = await getCurrentHousehold(tx);
    if (!household) throw new Error(`no household ${householdId} on this database (is DATABASE_URL the right branch?)`);
    const members = await tx<Member[]>`
      SELECT u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.household_id = ${householdId} AND m.joined_at IS NOT NULL ORDER BY m.id`;
    return { household, members };
  });
  if (members.length === 0) throw new Error("nobody has joined this household");

  const recipients: Member[] = to
    ? [{ name: (as ? members.find((m) => m.email === as) : members[0])?.name ?? members[0].name, email: to }]
    : members;
  const subject = `${household.name} moved to ${BRAND.domain}`;
  console.log(consoleMode() ? "console mode: nothing is sent (RESEND_API_KEY is empty)" : `sending to ${recipients.length} address${recipients.length === 1 ? "" : "es"} as ${household.name}, reply-to ${replyTo}`);
  let failed = 0;
  for (const r of recipients) {
    const ok = await sendMail({
      ctx: { ...scope, household: { id: household.id, name: household.name, fromName: household.fromName, replyTo: household.replyTo } },
      to: r.email,
      subject,
      replyTo,
      kind: "moved",
      react: createElement(Moved, {
        theme: household.theme,
        householdName: household.name,
        householdSlug: household.slug,
        recipientName: r.name,
        // What they sign in with: the review copy still shows the member's address, not the reviewer's.
        email: to ? (as ?? members[0].email) : r.email,
        oldHost: oldHost!,
        contact: replyTo!,
      }),
    });
    if (!ok) failed++;
    console.log(`${ok ? "sent" : "FAILED"}  ${r.email}  (${r.name})`);
    await new Promise((res) => setTimeout(res, 600)); // under Resend's 2 req/s
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
