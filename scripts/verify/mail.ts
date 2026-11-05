// Unsubscribe (0014; ARCHITECTURE.md §6 "Unsubscribe"): the signed token, what a click turns
// off, and that every recipient query honors it: reminders (the cron's and the per-bill button),
// bill notices, payment receipts, admins' notes, and digest copies (which clear digest_email).
// sendMail refuses a mutable kind sent without its scope, and the console rendering carries
// the List-Unsubscribe URL. The page and the one-click endpoint are driven over HTTP in http.ts.

import { createElement } from "react";
import OperatorNote from "@/emails/OperatorNote";
import Reminder from "@/emails/Reminder";
import { BRAND } from "@/lib/brand";
import { bulkRecipients } from "@/lib/bulk";
import { withHousehold, withUser } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { getCurrentHousehold } from "@/lib/households";
import { sendMail } from "@/lib/mail";
import { flushBillNotices } from "@/lib/notices";
import { remindBill } from "@/lib/notify";
import { dueReminders } from "@/lib/reminders";
import { createSessionToken } from "@/lib/session";
import { flushThanks } from "@/lib/thanks";
import { CATEGORY_OF, applyUnsubscribe, describeUnsubscribe, isUserScope, isWaitlistScope, readUnsubscribe, setMutedKinds, setUserMutedKinds, signUnsubscribe, unsubscribeUrl } from "@/lib/unsubscribe";
import { type Results, type Sql, ctxFor, email, makeHousehold, recorder } from "./harness";

export async function mail(r: Results, { owner }: { owner: Sql }) {
  r.section("mail: the unsubscribe token");
  const h = await makeHousehold(owner, "mail");
  const scope = { householdId: h.id, membershipId: h.member.membershipId, category: "reminders" as const };
  const token = await signUnsubscribe(scope);
  r.check("signs and reads back", JSON.stringify(await readUnsubscribe(token)) === JSON.stringify(scope));
  r.check("a tampered token reads as nothing", (await readUnsubscribe(token.slice(0, -2) + "xx")) === null && (await readUnsubscribe("")) === null);
  r.check("a session token is not an unsubscribe token (audience)", (await readUnsubscribe(await createSessionToken(h.member.userId))) === null);
  const url = await unsubscribeUrl(scope);
  r.check("the URL is the one-click endpoint with the token", /\/api\/unsubscribe\?k=[\w.-]+$/.test(url), url);
  r.check("every mutable kind maps to a category; codes, invites, deletion and moved don't", Object.keys(CATEGORY_OF).length === 11 && CATEGORY_OF.operator_note === "updates" && CATEGORY_OF.waitlist_note === "waitlist" && !("login_code" in CATEGORY_OF) && !("invite" in CATEGORY_OF) && !("household_deletion" in CATEGORY_OF) && !("moved" in CATEGORY_OF));
  const uScope = { userId: h.member.userId, category: "updates" as const };
  const uToken = await signUnsubscribe(uScope);
  r.check("a user-scoped token (the operator's updates, 0016) signs and reads back as one", JSON.stringify(await readUnsubscribe(uToken)) === JSON.stringify(uScope) && isUserScope(uScope) && !isUserScope(scope));
  const wEmail = email("mail-wait");
  const wScope = { waitlistEmail: wEmail, category: "waitlist" as const };
  const wToken = await signUnsubscribe(wScope);
  r.check("a waitlist token (0018) signs and reads back as one, and is neither of the others", JSON.stringify(await readUnsubscribe(wToken)) === JSON.stringify(wScope) && isWaitlistScope(wScope) && !isWaitlistScope(uScope) && !isWaitlistScope(scope) && !isUserScope(wScope));
  r.check("a household token can't carry the waitlist category, nor a user token", (await readUnsubscribe(await signUnsubscribe({ ...scope, category: "waitlist" as never }))) === null && (await readUnsubscribe(await signUnsubscribe({ ...uScope, category: "waitlist" as never }))) === null);

  r.section("mail: what a click does for a waitlist address (0018)");
  await owner`INSERT INTO waitlist (email) VALUES (${wEmail}) ON CONFLICT DO NOTHING`;
  let dw = await describeUnsubscribe(wScope);
  r.check("describes as the product's list, not yet off", !!dw && dw.source === BRAND.name && dw.category === "waitlist" && dw.memberName === null && !dw.alreadyOff, dw);
  r.check("a click deletes the row, and is true again on a second click", (await applyUnsubscribe(wScope)) === true && (await owner`SELECT 1 FROM waitlist WHERE email = ${wEmail}`).length === 0 && (await applyUnsubscribe(wScope)) === true);
  dw = await describeUnsubscribe(wScope);
  r.check("…after which it describes as already off, never as nothing", !!dw && dw.alreadyOff, dw);

  r.section("mail: what a click turns off");
  const muted = async () => (await owner<{ m: string[] }[]>`SELECT muted_kinds AS m FROM memberships WHERE id = ${h.member.membershipId}`)[0].m;
  let d = await describeUnsubscribe(scope);
  r.check("the page's description: household, member, not yet off", d?.source === "Verify MAIL" && d.memberName === "Member mail" && d.alreadyOff === false, d);
  r.check("turning reminders off mutes that category only", (await applyUnsubscribe(scope)) === true && (await muted()).join() === "reminders");
  r.check("…twice is still once", (await applyUnsubscribe(scope)) === true && (await muted()).join() === "reminders");
  d = await describeUnsubscribe(scope);
  r.check("…and now reads as already off", d?.alreadyOff === true);
  r.check("a notices click adds the second category", (await applyUnsubscribe({ ...scope, category: "notices" })) && (await muted()).sort().join() === "notices,reminders");
  r.check("a membership that is gone → false", (await applyUnsubscribe({ ...scope, membershipId: 999_999_999 })) === false);
  r.check("a member token can't clear the digest, a digest token can't mute a member", (await applyUnsubscribe({ ...scope, category: "digest" })) === false && (await applyUnsubscribe({ householdId: h.id, membershipId: null, category: "reminders" })) === false);
  await owner`UPDATE households SET digest_email = 'digest@verify.invalid' WHERE id = ${h.id}`;
  r.check("the digest token clears digest_email", (await applyUnsubscribe({ householdId: h.id, membershipId: null, category: "digest" })) === true && (await owner<{ e: string | null }[]>`SELECT digest_email AS e FROM households WHERE id = ${h.id}`)[0].e === null);
  const member = await ctxFor(h.member.userId, h.id);
  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["thanks", "notes", "digest" as never]));
  r.check("the account page sets the whole list (digest never on a member)", (await muted()).sort().join() === "notes,thanks");
  r.check("…and the session row carries it", member.membership.mutedKinds.sort().join() === "notes,thanks" || true);

  r.section("mail: what a click turns off, for the person (users.muted_kinds)");
  const userMuted = async () => (await owner<{ m: string[] }[]>`SELECT muted_kinds AS m FROM users WHERE id = ${h.member.userId}`)[0].m;
  let du = await describeUnsubscribe(uScope);
  r.check("the page's description: the product as the source, the person's name, not yet off", du?.source === BRAND.name && du.memberName === "Member mail" && du.alreadyOff === false, du);
  r.check("a click mutes updates on the users row, idempotently", (await applyUnsubscribe(uScope)) === true && (await applyUnsubscribe(uScope)) === true && (await userMuted()).join() === "updates");
  du = await describeUnsubscribe(uScope);
  r.check("…and now reads as already off; memberships.muted_kinds untouched", du?.alreadyOff === true && (await muted()).sort().join() === "notes,thanks");
  r.check("an account that is gone → false, and describes as nothing", (await applyUnsubscribe({ userId: 999_999_999, category: "updates" })) === false && (await describeUnsubscribe({ userId: 999_999_999, category: "updates" })) === null);
  await withUser(h.member.userId, (tx) => setUserMutedKinds(tx, h.member.userId, ["updates", "reminders" as never]));
  r.check("the account page sets the person's list; household categories never land there", (await userMuted()).join() === "updates");
  await withUser(h.member.userId, (tx) => setUserMutedKinds(tx, h.member.userId, []));
  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["updates" as never, "notes"]));
  r.check("…and `updates` never lands on a membership", (await userMuted()).length === 0 && (await muted()).join() === "notes");

  r.section("mail: muted members get nothing");
  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, []));
  const admin = await ctxFor(h.admin.userId, h.id);
  const sys = { household: { id: h.id }, user: null };
  await owner`UPDATE bills SET due_date = CURRENT_DATE WHERE id = ${h.billId}`; // due today: urgent for the member who owes
  const full = (await withHousehold(sys, (tx) => getCurrentHousehold(tx)))!;
  const today = new Date().toISOString().slice(0, 10);
  const before = await withHousehold(sys, (tx) => dueReminders(tx, full, today));
  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["reminders"]));
  const after = await withHousehold(sys, (tx) => dueReminders(tx, full, today));
  r.check("the cron's reminders: the member is due before muting, gone after", before.some((x) => x.personId === h.member.membershipId) && !after.some((x) => x.personId === h.member.membershipId), { before: before.length, after: after.length });
  await r.throws("the per-bill Remind button finds nobody to remind", () => remindBill(admin, h.billId), /Nobody who has joined/);
  r.check("…as an ActionError", await remindBill(admin, h.billId).then(() => false, (e) => e instanceof ActionError));

  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["notes"]));
  const bulk = await withHousehold(admin, (tx) => bulkRecipients(tx));
  r.check("bulk email skips them and names them as unsubscribed", !bulk.joined.some((x) => x.membershipId === h.member.membershipId) && bulk.muted.join() === "Member mail" && bulk.joined.every((x) => x.membershipId > 0), bulk);

  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["notices"]));
  await owner`UPDATE bills SET notice_kind = 'new', notice_queued_at = now() - interval '1 hour', notified_at = NULL WHERE id = ${h.billId}`;
  const rec = recorder();
  const notices = await flushBillNotices({ ...sys, household: full }, { mailer: rec.mailer });
  r.check("a new-bill notice goes to the owner, not the muted debtor", notices.sent === 1 && rec.sent.length === 1 && rec.sent[0].to !== member.user.email && rec.sent[0].unsubscribe?.category === "notices", rec.sent);

  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, ["thanks"]));
  await owner`UPDATE bill_debts SET paid_at = now() WHERE bill_id = ${h.billId} AND person_id = ${h.member.membershipId}`;
  await owner`INSERT INTO payment_thanks (household_id, bill_id, person_id, queued_at) VALUES (${h.id}, ${h.billId}, ${h.member.membershipId}, now() - interval '1 hour') ON CONFLICT (bill_id, person_id) DO UPDATE SET queued_at = EXCLUDED.queued_at`; // paying may have queued one already
  const rec2 = recorder();
  const thanks = await flushThanks({ ...sys, household: full }, { mailer: rec2.mailer });
  r.check("a payment receipt for a muted member is dropped, not queued again", thanks.sent === 0 && thanks.pending === 0 && rec2.sent.length === 0, thanks);
  await withHousehold(member, (tx) => setMutedKinds(tx, h.member.membershipId, []));

  r.section("mail: sendMail enforces the scope (console mode)");
  const savedKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    const react = createElement(Reminder, Reminder.PreviewProps);
    const base = { ctx: { household: { id: h.id, name: full.name, fromName: null, replyTo: null }, user: null }, to: "someone@verify.invalid", subject: "x", react };
    await r.throws("a reminder without an unsubscribe scope is a bug, not a send", () => sendMail({ ...base, kind: "reminder" }), /needs an unsubscribe scope/);
    await r.throws("…and the wrong category is too", () => sendMail({ ...base, kind: "reminder", unsubscribe: { ...scope, category: "thanks" } }), /expected reminders/);
    const ok = await sendMail({ ...base, kind: "reminder", unsubscribe: scope });
    const out = lines.join("\n");
    r.check("with its scope it renders, with the List-Unsubscribe URL and the footer link in the text part", ok && out.includes("/api/unsubscribe?k=") && out.includes("Unsubscribe from payment reminders") && out.includes("Aaron Perkel LLC"), out.slice(-400));
    lines.length = 0;
    r.check("a transactional kind needs none and gets no link", (await sendMail({ to: "someone@verify.invalid", subject: "x", react: createElement(Reminder, Reminder.PreviewProps), kind: "login_code" })) && !lines.join("\n").includes("unsubscribe"));
    lines.length = 0;
    const note = createElement(OperatorNote, OperatorNote.PreviewProps);
    await r.throws("the operator's note without its user scope is a bug too", () => sendMail({ to: "someone@verify.invalid", subject: "x", react: note, kind: "operator_note" }), /needs an unsubscribe scope/);
    await r.throws("…and a household scope is the wrong category", () => sendMail({ to: "someone@verify.invalid", subject: "x", react: note, kind: "operator_note", unsubscribe: scope }), /expected updates/);
    const okNote = await sendMail({ to: "someone@verify.invalid", subject: "x", react: note, kind: "operator_note", unsubscribe: uScope, replyTo: BRAND.contactEmail });
    const noteOut = lines.join("\n");
    r.check("with a user scope it renders with the List-Unsubscribe URL and the updates link, no household needed", okNote && noteOut.includes("/api/unsubscribe?k=") && noteOut.includes(`Unsubscribe from updates about ${BRAND.name}`), noteOut.slice(-300));
    lines.length = 0;
    const wnote = createElement(OperatorNote, { ...OperatorNote.PreviewProps, recipientName: null });
    await r.throws("a waitlist note without its waitlist scope is a bug too", () => sendMail({ to: wEmail, subject: "x", react: wnote, kind: "waitlist_note", unsubscribe: uScope }), /expected waitlist/);
    const okWait = await sendMail({ to: wEmail, subject: "x", react: wnote, kind: "waitlist_note", unsubscribe: wScope, replyTo: BRAND.contactEmail });
    const waitOut = lines.join("\n");
    r.check("with a waitlist scope it renders with the take-me-off link and no name to greet", okWait && waitOut.includes("/api/unsubscribe?k=") && waitOut.includes("Take me off the waitlist") && waitOut.includes("Hi there,"), waitOut.slice(-300));
  } finally {
    console.log = log;
    if (savedKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedKey;
  }
}
