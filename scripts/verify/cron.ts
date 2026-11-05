// Phase 4: the hourly tick, reminders, the thanks queue, the budget and bulk email, at the
// library level against fixture households. Two rules keep it from touching anything real:
// every send goes through a recording Mailer (a dev .env.local may hold a live RESEND_API_KEY),
// and the tick only ever runs for fixture ids (`tick({ only })`), never the seed households.
// Simulated clocks sit in the future so the budget check (sends since that UTC midnight) sees
// none of the dev branch's real email_log.

import { bulkRecipients, sendBulkEmail } from "@/lib/bulk";
import { setPaid } from "@/lib/bills";
import type { Ctx } from "@/lib/context";
import { existsSync, readFileSync } from "node:fs";
import { authorizeCron, flushHousehold, tick, tickHousehold, tickSummary } from "@/lib/cron";
import { withHousehold } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { CRON_DAILY_LIMIT, BULK_DAILY_LIMIT, sendsToday } from "@/lib/mail";
import { render } from "@react-email/components";
import { OVERDUE_EVERY_DAYS, dueReminders, reminderLevel, reminderMessage } from "@/lib/reminders";
import { type SettingsForm, parseSettings } from "@/lib/settings";
import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";
import { THANKS_DELAY_MINUTES, flushThanks } from "@/lib/thanks";
import { WAKE_DELAY_SECONDS, WAKE_RETENTION_SECONDS, WAKE_TOPIC, scheduleFlush, wakeKey } from "@/lib/wake";
import { localDate, localHour } from "@/lib/time";
import { BUDGET_KIND, BUDGET_MARK, type Results, type Sql, addMember, ctxFor, makeHousehold, recorder } from "./harness";

const at = (iso: string) => new Date(iso);
const hours = (start: string, n: number) => Array.from({ length: n }, (_, i) => new Date(at(start).getTime() + i * 3_600_000));

export async function cron(r: Results, { owner }: { owner: Sql }) {
  const h = await makeHousehold(owner, "cr", "ledger");
  const hid = h.id;
  await owner`DELETE FROM payment_thanks WHERE household_id = ${hid}`; // makeHousehold queues one
  const memberEmail = (await owner<{ email: string }[]>`SELECT email FROM users WHERE id = ${h.member.userId}`)[0].email;
  const adminEmail = (await owner<{ email: string }[]>`SELECT email FROM users WHERE id = ${h.admin.userId}`)[0].email;

  /** Replaces the household's bills with one the member owes, due on `due`. */
  const freshBill = async (due: string) => {
    await owner`DELETE FROM bills WHERE household_id = ${hid}`;
    const [b] = await owner<{ id: number }[]>`
      INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner)
      VALUES (${hid}, ${h.typeId}, ${due}::date - 20, ${due}, 80.00, 40.00, ${h.admin.membershipId}, ${h.admin.membershipId}, true) RETURNING id`;
    await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${hid}, ${b.id}, ${h.member.membershipId})`;
    return b.id;
  };
  const setHousehold = (tz: string, sendHour: number) =>
    owner`UPDATE households SET timezone = ${tz}, send_hour = ${sendHour}, reminders_enabled = true,
            first_reminder_days = 7, urgent_reminder_days = 3, last_send_date = NULL, digest_email = NULL WHERE id = ${hid}`;
  const lastSendDate = async () => (await owner<{ d: string | null }[]>`SELECT last_send_date::text AS d FROM households WHERE id = ${hid}`)[0].d; // the harness's owner has no DATE parser

  // ---------------------------------------------------------------------------------------------
  r.section("cron: local time across timezones and DST (pure)");
  const wall = (tz: string, iso: string) => `${localDate(tz, at(iso))} ${String(localHour(tz, at(iso))).padStart(2, "0")}`;
  const cases: [string, string, string, string][] = [
    ["America/New_York", "2027-03-14T06:07:00Z", "2027-03-14 01", "spring forward: 1 AM EST"],
    ["America/New_York", "2027-03-14T07:07:00Z", "2027-03-14 03", "…an hour later it's 3 AM (2 AM never happens)"],
    ["America/New_York", "2026-11-01T05:07:00Z", "2026-11-01 01", "fall back: 1 AM EDT"],
    ["America/New_York", "2026-11-01T06:07:00Z", "2026-11-01 01", "…and 1 AM again, EST"],
    ["Australia/Sydney", "2027-04-03T15:07:00Z", "2027-04-04 02", "Sydney autumn: 2 AM AEDT"],
    ["Australia/Sydney", "2027-04-03T16:07:00Z", "2027-04-04 02", "…and 2 AM again, AEST"],
    ["Australia/Sydney", "2027-10-02T16:07:00Z", "2027-10-03 03", "Sydney spring: 2 AM skipped"],
    ["Asia/Kolkata", "2027-01-10T03:37:00Z", "2027-01-10 09", "half-hour offset (+5:30)"],
    ["Pacific/Auckland", "2027-01-10T20:07:00Z", "2027-01-11 09", "Auckland is already tomorrow"],
  ];
  for (const [tz, iso, want, label] of cases) r.check(`${label}: ${tz} ${iso} → ${want}`, wall(tz, iso) === want, wall(tz, iso));

  // ---------------------------------------------------------------------------------------------
  r.section("cron: send hour across timezones and DST (hourly ticks, real claims)");
  /** Ticks hourly from `start`; returns the local wall times at which a batch went out. */
  const simulate = async (tz: string, sendHour: number, start: string, n: number) => {
    await setHousehold(tz, sendHour);
    const firstLocal = localDate(tz, at(start));
    await freshBill(new Date(Date.parse(`${firstLocal}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10));
    const fired: string[] = [];
    for (const now of hours(start, n)) {
      const { mailer } = recorder();
      const t = await tickHousehold(hid, { now, mailer });
      if (t.tried) fired.push(`${localDate(tz, now)} ${String(localHour(tz, now)).padStart(2, "0")}:07`);
    }
    return fired;
  };
  const sims: [string, number, string, number, string[], string, string?][] = [
    ["America/New_York", 2, "2027-03-14T05:07:00Z", 6, ["2027-03-14 03:07"], "NY spring forward, send at 2 AM → first tick after, 3:07"],
    ["America/New_York", 1, "2026-11-01T04:07:00Z", 5, ["2026-11-01 01:07"], "NY fall back, send at 1 AM → once, though 1 AM happens twice"],
    ["Australia/Sydney", 2, "2027-04-03T13:07:00Z", 5, ["2027-04-04 02:07"], "Sydney autumn, send at 2 AM → once across the repeated hour"],
    ["Australia/Sydney", 2, "2027-10-02T14:07:00Z", 4, ["2027-10-03 03:07"], "Sydney spring, send at 2 AM → 3:07"],
    ["Asia/Kolkata", 9, "2027-01-10T02:37:00Z", 3, ["2027-01-10 09:07"], "Kolkata +5:30, send at 9 AM"],
    ["Pacific/Auckland", 9, "2027-01-10T19:07:00Z", 3, ["2027-01-11 09:07"], "Auckland, send at 9 AM on its own (UTC-tomorrow) date", "2027-01-11"],
    ["UTC", 0, "2027-01-10T22:07:00Z", 4, ["2027-01-10 22:07", "2027-01-11 00:07"], "send hour 0: late first tick sends, then midnight the next day"],
    ["UTC", 23, "2027-01-10T21:07:00Z", 4, ["2027-01-10 23:07"], "send hour 23: 23:07 only; 00:07 is before 23:00 again"],
  ];
  for (const [tz, sendHour, start, n, want, label, claimed] of sims) {
    const fired = await simulate(tz, sendHour, start, n);
    r.check(label, JSON.stringify(fired) === JSON.stringify(want), fired);
    if (claimed) r.check(`…and claims its local date, ${claimed}`, (await lastSendDate()) === claimed, await lastSendDate());
  }

  // ---------------------------------------------------------------------------------------------
  r.section("cron: once per day");
  const D = "2030-06-10";
  const noon = (d: string, hh = 12) => at(`${d}T${String(hh).padStart(2, "0")}:07:00Z`);
  await setHousehold("UTC", 9);
  await freshBill("2030-06-11");
  let rec = recorder();
  let t = await tickHousehold(hid, { now: noon(D), mailer: rec.mailer });
  r.check("first tick after the send hour sends", t.tried && t.sent === 1 && (await lastSendDate()) === D, t);
  r.check("…the reminder replies to the bill's owner", rec.sent[0]?.replyTo === adminEmail && rec.sent[0]?.to === memberEmail, rec.sent[0]);
  t = await tickHousehold(hid, { now: noon(D, 13), mailer: recorder().mailer });
  r.check("a second tick the same day doesn't", !t.tried && t.skipped === "already sent today", t);
  await owner`UPDATE households SET last_send_date = NULL WHERE id = ${hid}`;
  const both = await Promise.all([tickHousehold(hid, { now: noon(D), mailer: recorder().mailer }), tickHousehold(hid, { now: noon(D), mailer: recorder().mailer })]);
  r.check("two concurrent ticks: exactly one batch", both.filter((x) => x.tried).length === 1, both.map((x) => x.skipped ?? "sent"));
  t = await tickHousehold(hid, { now: noon("2030-06-11"), mailer: recorder().mailer });
  r.check("the next day sends again", t.tried && (await lastSendDate()) === "2030-06-11");
  await owner`UPDATE households SET last_send_date = '2030-06-11', timezone = 'Pacific/Honolulu' WHERE id = ${hid}`;
  t = await tickHousehold(hid, { now: at("2030-06-11T23:07:00Z"), mailer: recorder().mailer }); // Honolulu: 13:07 on the 11th
  r.check("moving to a timezone where it's the same day: no second send", !t.tried && t.skipped === "already sent today", t);
  await owner`UPDATE households SET last_send_date = '2030-06-12' WHERE id = ${hid}`;
  t = await tickHousehold(hid, { now: at("2030-06-11T23:07:00Z"), mailer: recorder().mailer });
  r.check("…or where it's still yesterday (`<`, not `!=`)", !t.tried && (await lastSendDate()) === "2030-06-12", t);
  await owner`UPDATE households SET reminders_enabled = false WHERE id = ${hid}`;
  t = await tickHousehold(hid, { now: noon("2030-06-20"), mailer: recorder().mailer });
  r.check("reminders off: no batch", !t.tried && t.skipped === "reminders off");
  await setHousehold("UTC", 9);
  t = await tickHousehold(hid, { now: noon(D, 8), mailer: recorder().mailer });
  r.check("before the send hour: no batch, no claim", !t.tried && (await lastSendDate()) === null, t);

  // ---------------------------------------------------------------------------------------------
  r.section("cron: failures and releases");
  await setHousehold("UTC", 9);
  await freshBill("2030-06-11");
  rec = recorder({ fail: () => true });
  t = await tickHousehold(hid, { now: noon(D), mailer: rec.mailer });
  r.check("every send failed → claim released, nothing stamped", t.tried && t.sent === 0 && t.failed === 1 && (await lastSendDate()) === null, t);
  t = await tickHousehold(hid, { now: noon(D, 13), mailer: recorder().mailer });
  r.check("…so the next tick retries and sends", t.sent === 1 && (await lastSendDate()) === D);
  const second = await addMember(owner, { id: hid }, `cr-second`, { joined: true });
  const billId = await freshBill("2030-06-11");
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${hid}, ${billId}, ${second.membershipId})`;
  await owner`UPDATE households SET last_send_date = NULL WHERE id = ${hid}`;
  t = await tickHousehold(hid, { now: noon(D), mailer: recorder({ fail: (to) => to === memberEmail }).mailer });
  r.check("one of two failed → stamped (partial success counts)", t.sent === 1 && t.failed === 1 && (await lastSendDate()) === D, t);
  await owner`DELETE FROM bills WHERE household_id = ${hid}`;
  await owner`UPDATE households SET last_send_date = NULL WHERE id = ${hid}`;
  t = await tickHousehold(hid, { now: noon(D), mailer: recorder().mailer });
  r.check("nothing due → the day is stamped anyway", !t.tried && t.skipped === "nothing due" && (await lastSendDate()) === D, t);

  // The amendment's case: a slow tick that fails must not undo a later tick's successful claim.
  await freshBill("2030-06-12");
  await owner`UPDATE households SET last_send_date = NULL WHERE id = ${hid}`;
  let open!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((res) => (open = res));
  const inSend = new Promise<void>((res) => (entered = res));
  const slow = tickHousehold(hid, { now: noon(D), mailer: recorder({ fail: () => true, gate, entered }).mailer });
  await inSend; // A has claimed D and is stuck sending
  const later = await tickHousehold(hid, { now: noon("2030-06-11"), mailer: recorder().mailer });
  r.check("while A hangs, B claims the next day and sends", later.sent >= 1 && (await lastSendDate()) === "2030-06-11", later);
  open();
  const a = await slow;
  r.check("A then fails, and its release leaves B's claim alone", a.sent === 0 && (await lastSendDate()) === "2030-06-11", { a, last: await lastSendDate() });

  // ---------------------------------------------------------------------------------------------
  r.section("cron: who gets a reminder");
  const lv = (d: number) => reminderLevel(d, { firstReminderDays: 7, urgentReminderDays: 3 });
  const expect: [number, string | null][] = [
    [8, null], [7, "heads_up"], [6, null], [4, null], [3, "urgent"], [1, "urgent"], [0, "urgent"],
    [-1, "overdue"], [-2, null], [-3, null], [-4, "overdue"], [-5, null], [-7, "overdue"], [-10, "overdue"],
  ];
  const got = expect.map(([d]) => lv(d));
  r.check(`heads-up at exactly 7, urgent 3…0, then overdue every ${OVERDUE_EVERY_DAYS} days (1, 4, 7, …)`, expect.every(([, w], i) => got[i] === w), got);
  await setHousehold("UTC", 9);
  const remBill = await freshBill("2030-06-12");
  const pendingInvite = await addMember(owner, { id: hid }, `cr-pending`, { joined: false });
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id, paid_at) VALUES (${hid}, ${remBill}, ${second.membershipId}, now())`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${hid}, ${remBill}, ${pendingInvite.membershipId})`;
  const fullH = (await ctxFor(h.admin.userId, hid)).household;
  const due = await withHousehold({ household: { id: hid }, user: null }, (tx) => dueReminders(tx, fullH, "2030-06-10"));
  r.check("only unpaid rows of joined members (paid row and pending invite skipped)", due.length === 1 && due[0].personId === h.member.membershipId, due.map((d) => d.personId));
  const msg = reminderMessage(fullH, due[0]);
  r.check("…urgent copy, Reply-To the bill's owner", msg.subject.startsWith("Due soon") && msg.replyTo === adminEmail, msg.subject);
  const late = await withHousehold({ household: { id: hid }, user: null }, (tx) => dueReminders(tx, fullH, "2030-06-13"));
  r.check("a day overdue → 'Past due'", late.length === 1 && reminderMessage(fullH, late[0]).subject.startsWith("Past due"));
  // The payer's own check-off (0017): the owner gets the same cadence about paying the provider.
  await owner`UPDATE households SET feature_owner_checkoff = true WHERE id = ${hid}`;
  await owner`UPDATE bills SET owner_paid_at = NULL WHERE id = ${remBill}`;
  const fullOn = (await ctxFor(h.admin.userId, hid)).household;
  const withOwner = await withHousehold({ household: { id: hid }, user: null }, (tx) => dueReminders(tx, fullOn, "2030-06-10"));
  const prov = withOwner.find((d) => d.kind === "provider");
  r.check("with the payer's check-off on: the owner gets a provider reminder too, the share reminder unchanged", withOwner.length === 2 && prov?.personId === h.admin.membershipId && prov.email === adminEmail && withOwner.filter((d) => d.kind === "share").length === 1 && withOwner.every((d) => d.kind === "share" || d.level === "urgent"), withOwner.map((d) => [d.kind, d.personId]));
  const pmsg = reminderMessage(fullOn, prov!);
  const ptext = await render(pmsg.react, { plainText: true });
  r.check("…about the provider: the bill's total, no \"Pay to\", replies to the household rather than the owner", pmsg.subject === "Due soon: the Gas bill" && pmsg.replyTo === null && ptext.includes("to the provider") && !ptext.includes("Pay to") && ptext.includes("80.00") && pmsg.unsubscribe?.category === "reminders", pmsg.subject);
  await owner`UPDATE bills SET owner_paid_at = now() WHERE id = ${remBill}`;
  r.check("…and none once the owner has ticked it off", (await withHousehold({ household: { id: hid }, user: null }, (tx) => dueReminders(tx, fullOn, "2030-06-10"))).every((d) => d.kind === "share"));
  await owner`UPDATE households SET feature_owner_checkoff = false WHERE id = ${hid}`;
  await owner`UPDATE bills SET owner_paid_at = NULL WHERE id = ${remBill}`;
  r.check("…and none with the setting off, whatever the column says", (await withHousehold({ household: { id: hid }, user: null }, (tx) => dueReminders(tx, fullH, "2030-06-10"))).every((d) => d.kind === "share"));

  // ---------------------------------------------------------------------------------------------
  r.section("cron: thanks queue");
  const admin: Ctx = await ctxFor(h.admin.userId, hid);
  const b1 = await freshBill("2030-06-12");
  const [b2row] = await owner<{ id: number }[]>`
    INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner)
    VALUES (${hid}, ${h.memberTypeId}, '2030-05-20', '2030-06-14', 60.00, 30.00, ${h.admin.membershipId}, ${h.admin.membershipId}, true) RETURNING id`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id) VALUES (${hid}, ${b2row.id}, ${h.member.membershipId})`;
  const pay = (bill: number, paid: boolean) => withHousehold(admin, (tx) => setPaid(tx, admin, bill, h.member.membershipId, paid));
  const age = (minutes: number) => owner`UPDATE payment_thanks SET queued_at = now() - make_interval(mins => ${minutes}) WHERE household_id = ${hid}`;
  await pay(b1, true);
  await pay(b2row.id, true);
  await age(THANKS_DELAY_MINUTES - 1);
  rec = recorder();
  let th = await flushThanks(admin, { mailer: rec.mailer });
  r.check(`inside the ${THANKS_DELAY_MINUTES}-minute undo window: nothing sent`, th.sent === 0 && th.pending === 2 && rec.sent.length === 0, th);
  await age(THANKS_DELAY_MINUTES + 1);
  th = await flushThanks(admin, { mailer: rec.mailer });
  r.check("past it: ONE receipt for both bills", th.sent === 1 && th.pending === 0 && rec.sent.length === 1 && rec.sent[0].kind === "thanks" && /Gas/.test(rec.sent[0].subject) && /Water/.test(rec.sent[0].subject), rec.sent);
  await pay(b1, false);
  await pay(b1, true);
  await pay(b1, false);
  await age(THANKS_DELAY_MINUTES + 1);
  th = await flushThanks(admin, { mailer: (rec = recorder()).mailer });
  r.check("checked then unchecked: the receipt is cancelled", th.sent === 0 && rec.sent.length === 0 && th.pending === 0, th);
  await pay(b1, true);
  await age(THANKS_DELAY_MINUTES + 1);
  await pay(b2row.id, false);
  await pay(b2row.id, true); // a fresh check-off restarts the window for the person
  th = await flushThanks(admin, { mailer: (rec = recorder()).mailer });
  r.check("a new check-off restarts the window for the whole burst", th.sent === 0 && th.pending === 2, th);
  await age(THANKS_DELAY_MINUTES + 1);
  const [{ q: before }] = await owner<{ q: Date }[]>`SELECT min(queued_at) AS q FROM payment_thanks WHERE household_id = ${hid}`;
  th = await flushThanks(admin, { mailer: recorder({ fail: () => true }).mailer });
  const back = await owner<{ q: Date }[]>`SELECT queued_at AS q FROM payment_thanks WHERE household_id = ${hid} ORDER BY queued_at`;
  r.check("a failed send goes back in the queue with its original time", th.failed === 1 && back.length === 2 && back[0].q.getTime() === before.getTime(), { th, back });
  th = await flushThanks(admin, { mailer: (rec = recorder()).mailer });
  r.check("…and goes out on the next flush", th.sent === 1 && rec.sent.length === 1);
  await owner`UPDATE households SET feature_thanks = false WHERE id = ${hid}`;
  await owner`INSERT INTO payment_thanks (household_id, bill_id, person_id, queued_at) VALUES (${hid}, ${b1}, ${h.member.membershipId}, now() - interval '1 hour')`;
  const noThanks = await ctxFor(h.admin.userId, hid);
  th = await flushThanks(noThanks, { mailer: (rec = recorder()).mailer });
  r.check("feature_thanks off: the flush sends nothing", th.sent === 0 && rec.sent.length === 0);
  await owner`UPDATE households SET feature_thanks = true WHERE id = ${hid}`;
  await owner`DELETE FROM payment_thanks WHERE household_id = ${hid}`;

  // ---------------------------------------------------------------------------------------------
  r.section("cron: the daily email budget");
  // Real clock here: the budget counts today's actual sends, and previews send real mail into the
  // dev email_log, so the count can move mid-section (it did: two deletion emails from a preview
  // crashed a run on 2026-10-13). padTo() re-reads it each time and tops it up to an exact total
  // with rows marked with this run, removed in the finally below and by the sweep.
  const now = new Date();
  await setHousehold("UTC", 0);
  await freshBill(localDate("UTC", now)); // the member owes, due today: a batch of exactly 1
  // …plus a settled receipt waiting in the queue, on a bill the member has already paid.
  const [paidBill] = await owner<{ id: number }[]>`
    INSERT INTO bills (household_id, type_id, bill_date, due_date, total, per_person_cost, added_by_id, owner_id, had_owner)
    VALUES (${hid}, ${h.memberTypeId}, current_date - 20, current_date + 20, 60.00, 30.00, ${h.admin.membershipId}, ${h.admin.membershipId}, true) RETURNING id`;
  await owner`INSERT INTO bill_debts (household_id, bill_id, person_id, paid_at) VALUES (${hid}, ${paidBill.id}, ${h.member.membershipId}, now())`;
  await owner`INSERT INTO payment_thanks (household_id, bill_id, person_id, queued_at) VALUES (${hid}, ${paidBill.id}, ${h.member.membershipId}, now() - interval '1 hour')`;
  const used = await withHousehold({ household: { id: hid }, user: null }, (tx) => sendsToday(tx, now));
  const unpad = () => owner`DELETE FROM email_log WHERE to_hash = ${BUDGET_MARK} AND kind = ${BUDGET_KIND}`;
  /** Makes today's count exactly `total`: drops this run's padding, re-reads the real count, tops it up. */
  const padTo = async (total: number) => {
    await unpad();
    const real = await withHousehold({ household: { id: hid }, user: null }, (tx) => sendsToday(tx, now));
    if (total > real) await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) SELECT NULL, ${BUDGET_KIND}, ${BUDGET_MARK}, true FROM generate_series(1, ${total - real})`;
  };
  if (used + 3 > BULK_DAILY_LIMIT) {
    r.check("budget checks need headroom today", false, `${used} sends already today on dev`);
  } else {
    try {
      await padTo(CRON_DAILY_LIMIT); // batch of 1 → one over the ceiling
      rec = recorder();
      t = await tickHousehold(hid, { now, mailer: rec.mailer });
      r.check(`one over ${CRON_DAILY_LIMIT} → deferred, not stamped`, t.deferred === "budget" && !t.tried && (await lastSendDate()) === null, t);
      r.check("…while the thanks queue still flushed (never deferred)", t.thanks.sent === 1 && rec.sent.some((s) => s.kind === "thanks"), t.thanks);
      await padTo(CRON_DAILY_LIMIT - 1); // batch of 1 → exactly the ceiling
      t = await tickHousehold(hid, { now, mailer: recorder().mailer });
      r.check(`exactly ${CRON_DAILY_LIMIT} → sends`, t.tried && t.sent === 1 && (await lastSendDate()) === localDate("UTC", now), t);
      await owner`UPDATE households SET last_send_date = NULL, digest_email = ${`digest-${hid}@verify.invalid`} WHERE id = ${hid}`;
      await padTo(CRON_DAILY_LIMIT - 1);
      t = await tickHousehold(hid, { now, mailer: recorder().mailer });
      r.check("the digest copy counts toward the batch (1 + 1 → one over → deferred)", t.deferred === "budget", t);
      await owner`UPDATE households SET digest_email = NULL WHERE id = ${hid}`;

      // Bulk email stops at BULK_DAILY_LIMIT.
      await owner`UPDATE households SET feature_bulk_email = true WHERE id = ${hid}`;
      const bulkAdmin = await ctxFor(h.admin.userId, hid);
      const joined = await withHousehold(bulkAdmin, async (tx) => (await bulkRecipients(tx)).joined.length);
      await padTo(BULK_DAILY_LIMIT - joined + 1);
      const refused = await sendBulkEmail(bulkAdmin, { subject: "Hi", body: "Hello" }, { now, mailer: (rec = recorder()).mailer }).then(
        () => "",
        (e) => (e instanceof ActionError ? e.message : `bug: ${e}`),
      );
      r.check(`bulk email one over ${BULK_DAILY_LIMIT} → refused, with when to try again`, /Try again after \d{1,2}:\d{2} [AP]M/.test(refused) && rec.sent.length === 0, refused);
      await padTo(BULK_DAILY_LIMIT - joined);
      // A refusal here is a failed check, not a suite crash.
      const report = await sendBulkEmail(bulkAdmin, { subject: "Hi", body: "Hello" }, { now, mailer: (rec = recorder()).mailer }).catch((e) => {
        if (e instanceof ActionError) return { sentTo: [] as string[], refused: e.message };
        throw e;
      });
      r.check(`…exactly ${BULK_DAILY_LIMIT} → sends to every joined member, not the pending invite`, report.sentTo.length === joined && rec.sent.every((s) => s.kind === "custom" && s.replyTo === adminEmail) && !rec.sent.some((s) => s.to.includes("cr-pending")), report);
    } finally {
      await unpad(); // even when a check throws, so later suites see the real count
    }
  }

  // ---------------------------------------------------------------------------------------------
  r.section("cron: the endpoint's lock and tick()");
  r.check("no Authorization header → denied", authorizeCron(null, "s3cret") === "denied");
  r.check("wrong secret → denied", authorizeCron("Bearer s3crex", "s3cret") === "denied");
  r.check("wrong length → denied (no timingSafeEqual throw)", authorizeCron("Bearer s", "s3cret") === "denied");
  r.check("not a bearer → denied", authorizeCron("s3cret", "s3cret") === "denied");
  r.check("right secret → ok", authorizeCron("Bearer s3cret", "s3cret") === "ok");
  r.check("server without CRON_SECRET → missing (500), even with a header", authorizeCron("Bearer ", "") === "missing" && authorizeCron(null, "") === "missing");
  await setHousehold("UTC", 9);
  await freshBill("2030-06-11");
  let report = await tick({ only: [hid], now: noon(D), mailer: recorder().mailer });
  r.check("tick({ only }) runs just the fixture household", report.households.length === 1 && report.households[0].id === hid && report.status === 200, report);
  await owner`UPDATE households SET last_send_date = NULL WHERE id = ${hid}`;
  report = await tick({ only: [hid], now: noon(D), mailer: recorder({ fail: () => true }).mailer });
  r.check("every household that tried failed → 500", report.status === 500, report);

  // ---------------------------------------------------------------------------------------------
  r.section("cron: the ten-minute wake-up (lib/wake.ts)");
  type WakeCall = { topic: string; body: { householdId: number }; opts: { delaySeconds: number; retentionSeconds: number; idempotencyKey: string } };
  const wakes: WakeCall[] = [];
  const sender = async (topic: string, body: { householdId: number }, opts: WakeCall["opts"]) => {
    wakes.push({ topic, body, opts });
  };
  const onVercel = { VERCEL: "1" } as unknown as NodeJS.ProcessEnv;
  const t0 = new Date("2030-06-01T12:00:10Z");
  let w = await scheduleFlush(hid, { now: t0, send: sender, env: onVercel });
  r.check("on Vercel: one message on the topic, naming the household", w === "scheduled" && wakes.length === 1 && wakes[0].topic === WAKE_TOPIC && wakes[0].body.householdId === hid, wakes);
  r.check(`…delayed a minute past the longer window (${WAKE_DELAY_SECONDS}s) and kept an hour`, wakes[0].opts.delaySeconds === WAKE_DELAY_SECONDS && WAKE_DELAY_SECONDS >= Math.max(NOTICE_DELAY_MINUTES, THANKS_DELAY_MINUTES) * 60 + 60 && wakes[0].opts.retentionSeconds === WAKE_RETENTION_SECONDS && wakes[0].opts.retentionSeconds > wakes[0].opts.delaySeconds, wakes[0].opts);
  r.check("…keyed per household and minute", wakes[0].opts.idempotencyKey === wakeKey(hid, t0) && /^h\d+:\d+$/.test(wakes[0].opts.idempotencyKey), wakes[0].opts.idempotencyKey);
  await scheduleFlush(hid, { now: new Date(t0.getTime() + 40_000), send: sender, env: onVercel });
  r.check("a second post in the same minute carries the same key (one message)", wakes.length === 2 && wakes[1].opts.idempotencyKey === wakes[0].opts.idempotencyKey);
  await scheduleFlush(hid, { now: new Date(t0.getTime() + 60_000), send: sender, env: onVercel });
  r.check("…the next minute a new one", wakes.length === 3 && wakes[2].opts.idempotencyKey !== wakes[0].opts.idempotencyKey);
  w = await scheduleFlush(hid, { now: t0, send: async () => { throw new Error("vqs down"); }, env: onVercel });
  r.check("a publish that throws → \"failed\", never a throw", w === "failed");
  const wakesBefore = wakes.length;
  w = await scheduleFlush(hid, { now: t0, send: sender, env: {} as unknown as NodeJS.ProcessEnv });
  r.check("off Vercel (local, verify): skipped, the sender never called", w === "skipped" && wakes.length === wakesBefore);
  const vercelTs = readFileSync(new URL("../../vercel.ts", import.meta.url), "utf8");
  r.check("vercel.ts's trigger consumes WAKE_TOPIC into app/api/queues/flush", vercelTs.includes(`topic: "${WAKE_TOPIC}"`) && vercelTs.includes('"app/api/queues/flush/route.ts"') && vercelTs.includes('type: "queue/v2beta"'));
  r.check("the consumer route exists and is public in proxy.ts", existsSync(new URL("../../app/api/queues/flush/route.ts", import.meta.url)) && /\/api\\\/queues/.test(readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8")));

  // What the consumer runs: flushHousehold, the tick's own per-household flush.
  const wb = await freshBill("2030-06-20");
  const queueAt = (minutes: number) => owner`UPDATE bills SET notice_kind = 'new', notice_queued_at = now() - make_interval(mins => ${minutes}), notified_at = NULL WHERE id = ${wb}`;
  await queueAt(NOTICE_DELAY_MINUTES - 1);
  rec = recorder();
  let fl = await flushHousehold(hid, { mailer: rec.mailer });
  r.check(`flushHousehold inside the window: nothing sent, the bill still pending`, !fl.skipped && fl.notices.sent === 0 && fl.notices.pending === 1 && rec.sent.length === 0, fl);
  await queueAt(NOTICE_DELAY_MINUTES + 1);
  fl = await flushHousehold(hid, { mailer: rec.mailer });
  r.check("…past it: the new-bill email goes to the debtor, nothing left pending", fl.notices.sent >= 1 && fl.notices.pending === 0 && rec.sent.some((m) => m.kind === "new_bill" && m.to === memberEmail), { fl, sent: rec.sent.map((m) => [m.kind, m.to]) });
  await queueAt(NOTICE_DELAY_MINUTES + 1);
  await owner`UPDATE households SET delete_after = now() + interval '6 days' WHERE id = ${hid}`;
  fl = await flushHousehold(hid, { mailer: (rec = recorder()).mailer });
  r.check("a household marked for deletion: skipped, nothing sent, the queue kept", fl.skipped === "marked for deletion" && rec.sent.length === 0 && (await owner<{ k: string | null }[]>`SELECT notice_kind AS k FROM bills WHERE id = ${wb}`)[0].k === "new", fl);
  await owner`UPDATE households SET delete_after = NULL WHERE id = ${hid}`;
  await setHousehold("America/New_York", 9);
  const wt = await tickHousehold(hid, { now: new Date("2030-06-01T06:07:00Z"), mailer: (rec = recorder()).mailer });
  r.check("the tick runs the same flush (the new-bill email, reported under notices)", wt.notices.sent >= 1 && wt.notices.sent === rec.sent.filter((m) => m.kind === "new_bill").length && rec.sent.some((m) => m.kind === "new_bill" && m.to === memberEmail) && /notices \d/.test(tickSummary(wt)), { wt: tickSummary(wt), sent: rec.sent.map((m) => [m.kind, m.to]) });
  await owner`DELETE FROM bills WHERE household_id = ${hid}`;

  // ---------------------------------------------------------------------------------------------
  r.section("cron: settings validation (pure)");
  const base: SettingsForm = {
    name: "Elm", tagline: "", mode: "ledger", payerId: "", theme: "statement", colorScheme: "system",
    features: { rent: false, trends: false, bulkEmail: false, documents: false, welcomeTour: false, thanks: true, ownerCheckoff: false },
    monthlyRent: "", leaseStart: "", leaseEnd: "", askBillDate: false, billsPerPage: "10",
    remindersEnabled: true, sendHour: "9", firstReminderDays: "7", urgentReminderDays: "3", timezone: "America/New_York", fromName: "", replyTo: "", digestEmail: "",
  };
  const parse = (over: Partial<typeof base>) => {
    try {
      return parseSettings({ ...base, ...over });
    } catch (e) {
      return e instanceof ActionError ? e.message : `bug: ${e}`;
    }
  };
  const okInput = parse({ fromName: ' The "Elm" <House> ', replyTo: " Alex@Example.com " });
  r.check("valid input parses (quotes and brackets stripped, emails normalized)", typeof okInput === "object" && okInput.fromName === "The Elm House" && okInput.replyTo === "alex@example.com" && okInput.digestEmail === null, okInput);
  r.check("send hour 24 → refused", typeof parse({ sendHour: "24" }) === "string");
  r.check("daily window not shorter than the heads-up → refused", /after the heads-up/.test(String(parse({ urgentReminderDays: "7" }))));
  r.check("heads-up 0 or 31 → refused", typeof parse({ firstReminderDays: "0" }) === "string" && typeof parse({ firstReminderDays: "31" }) === "string");
  r.check("unknown timezone → refused", /time zone/.test(String(parse({ timezone: "Mars/Olympus" }))));
  r.check("a typo'd digest address is refused, not silently cleared", /digest address/.test(String(parse({ digestEmail: "alex@" }))));
  r.check("every problem listed at once", String(parse({ sendHour: "x", timezone: "nope" })).split("\n").length === 2);
}
