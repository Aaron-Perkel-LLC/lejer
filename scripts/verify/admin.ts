// The operator admin (0011, 0013; ARCHITECTURE.md §4 "Cross-household reads for the operator"):
// the admin_* definer functions are executable by lejer_app alone, hardened like
// email_sends_since, return aggregates, household metadata and the users list (addresses
// included, decided 2026-10-13; never an amount, hash, path or token), and widen nothing outside
// themselves. Then the operator's two writes in lib/admin.ts: deleting a user (every membership
// removed, then the row) and deleting a household right now (prefix, then row). The page itself
// (404 for everyone but SUPERADMIN_EMAILS) is checked over HTTP in http.ts.

import { list } from "@vercel/blob";
import { type AdminMembership, deleteHouseholdAsOperator, deleteUserAsOperator } from "@/lib/admin";
import { billPdfKey, householdPrefix, putBillPdf } from "@/lib/blob";
import { BRAND } from "@/lib/brand";
import { tick } from "@/lib/cron";
import { withUser } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { BULK_DAILY_LIMIT, sendsToday } from "@/lib/mail";
import { resolveAudience, sendOperatorNote } from "@/lib/operator-mail";
import { isSuperadmin, superadminEmails } from "@/lib/superadmin";
import { BUDGET_KIND, BUDGET_MARK, LOG_MARK, RUN, type Results, type Sql, addMember, email, makeHousehold, recorder } from "./harness";

const FUNCTIONS = ["admin_households", "admin_totals", "admin_weekly", "admin_email_kinds", "admin_email_failures", "admin_users"] as const;
/** Column names a definer function must never return (an address is allowed since 0013; its hash is not). */
const FORBIDDEN = /total|amount|per_person|to_hash|pdf|file_path|token|code_hash|reply_to|digest/i;

export async function admin(r: Results, { owner, app }: { owner: Sql; app: Sql }) {
  r.section("admin: definer functions in the catalog");
  const [{ col }] = await owner<{ col: string | null }[]>`
    SELECT column_name AS col FROM information_schema.columns WHERE table_name = 'households' AND column_name = 'last_tick_outcome'`;
  r.check("households.last_tick_outcome exists (0011)", col === "last_tick_outcome");
  const fns = await owner<{ name: string; definer: boolean; config: string[] | null; result: string; grantees: string[] | null }[]>`
    SELECT p.proname AS name, p.prosecdef AS definer, p.proconfig AS config, pg_get_function_result(p.oid) AS result,
           (SELECT array_agg(DISTINCT a.grantee::regrole::text) FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE') AS grantees
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(${[...FUNCTIONS]})`;
  for (const name of FUNCTIONS) {
    const f = fns.find((x) => x.name === name);
    r.check(`${name}: exists, SECURITY DEFINER`, f?.definer === true);
    r.check(`${name}: search_path pinned`, (f?.config ?? []).some((c) => /^search_path=public, pg_temp$/.test(c)), f?.config);
    r.check(`${name}: EXECUTE for the owner and lejer_app only (PUBLIC revoked)`, [...(f?.grantees ?? [])].sort().join(",") === "lejer_app,neondb_owner", f?.grantees);
    r.check(`${name}: returns no amount, hash, path or token column`, !!f && !FORBIDDEN.test(f.result), f?.result);
  }

  // Tags of their own: fixtures live until the run's final sweep, and rls uses "a" and "b".
  const a = await makeHousehold(owner, "adm-a");
  const b = await makeHousehold(owner, "adm-b");
  await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (${a.id}, 'reminder', ${LOG_MARK}, false)`;

  r.section("admin: what the functions return (pooled lejer_app, no GUC)");
  await app.begin(async (tx) => {
    const hs = await tx<{ id: number; name: string; memberCount: number; joinedCount: number; billCount: number; lastActivity: Date; createdAt: Date }[]>`
      SELECT id, name, member_count AS "memberCount", joined_count AS "joinedCount", bill_count AS "billCount", last_activity AS "lastActivity", created_at AS "createdAt"
      FROM admin_households()`;
    const ha = hs.find((h) => h.id === a.id);
    const hb = hs.find((h) => h.id === b.id);
    r.check("admin_households lists both fixtures with their counts", !!ha && !!hb && ha.memberCount === 2 && ha.joinedCount === 2 && ha.billCount === 1 && ha.name === "Verify ADM-A", { ha, hb });
    r.check("…last_activity is at least the creation time", !!ha && ha.lastActivity.getTime() >= ha.createdAt.getTime());
    const [t] = await tx<{ households: number; users: number; bills: number; billsUnpaid: number }[]>`
      SELECT households, users, bills, bills_unpaid AS "billsUnpaid" FROM admin_totals()`;
    r.check("admin_totals counts across households", t.households >= 2 && t.users >= 4 && t.bills >= 2 && t.billsUnpaid >= 2, t);
    const weeks = await tx<{ week: string; households: number }[]>`SELECT week, households FROM admin_weekly(8)`;
    r.check("admin_weekly: 8 rows, this week counts the fixtures", weeks.length === 8 && weeks[7].households >= 2, weeks);
    const kinds = await tx<{ kind: string; sent: number; failed: number }[]>`SELECT kind, sent, failed FROM admin_email_kinds(${new Date(Date.now() - 60_000)})`;
    const verifyKind = kinds.find((k) => k.kind === "verify");
    const reminderKind = kinds.find((k) => k.kind === "reminder");
    r.check("admin_email_kinds: per-kind sent and failed", !!verifyKind && verifyKind.sent >= 2 && !!reminderKind && reminderKind.failed >= 1, kinds);
    const failures = await tx<Record<string, unknown>[]>`SELECT * FROM admin_email_failures(${new Date(Date.now() - 60_000)}, 50)`;
    const mine = failures.find((f) => f.household_name === "Verify ADM-A" && f.kind === "reminder");
    r.check("admin_email_failures names the household, nothing else", !!mine && Object.keys(mine).sort().join(",") === "household_name,kind,sent_at", failures[0]);
    const users = await tx<{ id: number; email: string; name: string; memberships: AdminMembership[] }[]>`SELECT id, email, name, memberships FROM admin_users()`;
    const ua = users.find((u) => u.id === a.admin.userId);
    r.check("admin_users lists the fixture admin with their address and membership json", !!ua && ua.email === email("adm-a-admin") && ua.memberships.length === 1 && ua.memberships[0].householdId === a.id && ua.memberships[0].role === "admin" && ua.memberships[0].slug === a.slug && ua.memberships[0].joinedAt !== null, ua);
    r.check("…and nothing but id, email, name, created_at, memberships", Object.keys(users[0]).sort().join(",") === "email,id,memberships,name", Object.keys(users[0]));
    const [{ bills, households, members }] = await tx<{ bills: number; households: number; members: number }[]>`
      SELECT (SELECT count(*)::int FROM bills) AS bills, (SELECT count(*)::int FROM households) AS households, (SELECT count(*)::int FROM memberships) AS members`;
    r.check("…and the same transaction still sees 0 tenant rows directly (RLS untouched)", bills === 0 && households === 0 && members === 0, { bills, households, members });
  });

  // ---------------------------------------------------------------------------------------------
  // The operator's writes (lib/admin.ts), at library level with an operator-only users row.
  const refused = (name: string, fn: () => Promise<unknown>, re: RegExp) =>
    r.throws(name, async () => {
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof ActionError)) throw new Error(`not an ActionError: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    }, re);
  const operatorEmail = email("adm-operator");
  const [operatorRow] = await owner<{ id: number; email: string; name: string }[]>`INSERT INTO users (email, name) VALUES (${operatorEmail}, 'Operator') RETURNING id, email, name`;
  const savedList = process.env.SUPERADMIN_EMAILS;
  process.env.SUPERADMIN_EMAILS = operatorEmail;
  try {
    r.section("admin: deleting a user");
    const c = await makeHousehold(owner, "adm-c");
    const third = await addMember(owner, c, "adm-c-third"); // in C only, so deleting them leaves C with people
    const [{ email: memberEmail }] = await owner<{ email: string }[]>`SELECT email FROM users WHERE id = ${c.member.userId}`;
    await refused("the typed address must match", () => deleteUserAsOperator(operatorRow, c.member.userId, "someone-else@verify.invalid"), /exactly as shown/);
    await refused("the operator can't delete themselves", () => deleteUserAsOperator(operatorRow, operatorRow.id, operatorEmail), /your own account/);
    const [otherOp] = await owner<{ id: number }[]>`INSERT INTO users (email, name) VALUES (${email("adm-operator-2")}, 'Operator 2') RETURNING id`;
    process.env.SUPERADMIN_EMAILS = `${operatorEmail},${email("adm-operator-2")}`;
    await refused("…nor another address in SUPERADMIN_EMAILS", () => deleteUserAsOperator(operatorRow, otherOp.id, email("adm-operator-2")), /runs the site/);
    process.env.SUPERADMIN_EMAILS = operatorEmail;
    const out = await deleteUserAsOperator(operatorRow, c.member.userId, ` ${memberEmail.toUpperCase()} `);
    const [after] = await owner<{ users: number; members: number; debts: number; status: string; count: number }[]>`
      SELECT (SELECT count(*)::int FROM users WHERE id = ${c.member.userId}) AS users,
             (SELECT count(*)::int FROM memberships WHERE id = ${c.member.membershipId}) AS members,
             (SELECT count(*)::int FROM bill_debts WHERE person_id = ${c.member.membershipId}) AS debts,
             (SELECT status FROM bills WHERE id = ${c.billId}) AS status,
             (SELECT count(*)::int FROM memberships WHERE household_id = ${c.id}) AS count`;
    r.check("the member is gone: users row, membership, debt rows; the bill they alone owed on is paid", out.households === 1 && after.users === 0 && after.members === 0 && after.debts === 0 && after.status === "paid", { out, after });
    r.check("…and the household stays with the others in it", after.count === 2, after.count);
    // A household someone is alone in: it stays, empty.
    const d = await makeHousehold(owner, "adm-d");
    await owner`DELETE FROM memberships WHERE id = ${d.member.membershipId}`;
    const [{ email: dAdminEmail }] = await owner<{ email: string }[]>`SELECT email FROM users WHERE id = ${d.admin.userId}`;
    await deleteUserAsOperator(operatorRow, d.admin.userId, dAdminEmail);
    const [dAfter] = await owner<{ households: number; members: number }[]>`
      SELECT (SELECT count(*)::int FROM households WHERE id = ${d.id}) AS households, (SELECT count(*)::int FROM memberships WHERE household_id = ${d.id}) AS members`;
    r.check("deleting a household's only member leaves the household, empty", dAfter.households === 1 && dAfter.members === 0, dAfter);
    void third;

    r.section("admin: deleting a household right now");
    const key = billPdfKey(c.id, "Gas", "2030-01-01", c.billId);
    await putBillPdf(key, new TextEncoder().encode(`%PDF-1.4\n% verify ${RUN}\n%%EOF\n`).buffer as ArrayBuffer);
    await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) VALUES (${c.id}, 'reminder', ${LOG_MARK}, true)`;
    const logIds = (await owner<{ id: number }[]>`SELECT id FROM email_log WHERE household_id = ${c.id}`).map((x) => x.id);
    await refused("the typed slug must match", () => deleteHouseholdAsOperator(operatorRow, c.id, `${c.slug}-x`), /exactly as shown/);
    r.check("…and the household is untouched", (await list({ prefix: householdPrefix(c.id) })).blobs.length > 0 && (await owner`SELECT 1 FROM households WHERE id = ${c.id}`).length === 1);
    const gone = await deleteHouseholdAsOperator(operatorRow, c.id, ` ${c.slug} `);
    const [cAfter] = await owner<{ households: number; memberships: number; bills: number; users: number; logs: number }[]>`
      SELECT (SELECT count(*)::int FROM households WHERE id = ${c.id}) AS households,
             (SELECT count(*)::int FROM memberships WHERE household_id = ${c.id}) AS memberships,
             (SELECT count(*)::int FROM bills WHERE household_id = ${c.id}) AS bills,
             (SELECT count(*)::int FROM users WHERE id IN (${c.admin.userId}, ${third.userId})) AS users,
             (SELECT count(*)::int FROM email_log WHERE id = ANY(${logIds}) AND household_id IS NULL) AS logs`;
    r.check("every row of the household is gone, the people stay, its email_log rows lose their household", gone.name === "Verify ADM-C" && cAfter.households + cAfter.memberships + cAfter.bills === 0 && cAfter.users === 2 && cAfter.logs === logIds.length, cAfter);
    r.check("…and its Blob prefix is empty", (await list({ prefix: householdPrefix(c.id) })).blobs.length === 0);
    await refused("deleting it again: no longer exists", () => deleteHouseholdAsOperator(operatorRow, c.id, c.slug), /no longer exists/);

    r.section("admin: the operator's note: who an audience comes to");
    const invitee = await addMember(owner, a, "adm-a-invitee", { joined: false });
    await owner`UPDATE users SET muted_kinds = '{updates}' WHERE id = ${b.member.userId}`;
    // a's admin is in b too (joined): one person, two picked households, one copy.
    await owner`INSERT INTO memberships (household_id, user_id, role, joined_at) VALUES (${b.id}, ${a.admin.userId}, 'member', now())`;
    const audience = (x: Parameters<typeof resolveAudience>[1]) => withUser(operatorRow.id, (tx) => resolveAudience(tx, x));
    const ids = (rep: Awaited<ReturnType<typeof resolveAudience>>) => rep.to.map((t) => t.userId ?? 0).sort((x, y) => x - y).join();
    const emails = await owner<{ id: number; email: string }[]>`SELECT id, email FROM users WHERE id IN (${a.admin.userId}, ${a.member.userId}, ${b.admin.userId})`;
    let rep = await audience({ kind: "everyone" });
    r.check("everyone: the joined, unmuted people, never the operator, never an invite-only address", [a.admin.userId, a.member.userId, b.admin.userId].every((id) => rep.to.some((t) => t.userId === id)) && !rep.to.some((t) => t.userId === operatorRow.id || t.userId === invitee.userId || t.userId === b.member.userId) && rep.muted >= 1 && rep.skipped >= 2, { to: rep.to.length, muted: rep.muted, skipped: rep.skipped });
    r.check("…each with their address and name", rep.to.filter((t) => emails.some((e) => e.id === t.userId)).every((t) => emails.find((e) => e.id === t.userId)!.email === t.email && (t.name ?? "").length > 0));
    rep = await audience({ kind: "households", ids: [a.id] });
    r.check("one household: its two joined members, the invitee skipped, 1 household", ids(rep) === [a.admin.userId, a.member.userId].sort((x, y) => x - y).join() && rep.skipped === 1 && rep.muted === 0 && rep.households === 1, rep);
    rep = await audience({ kind: "households", ids: [a.id, b.id] });
    r.check("two households: the person in both once, b's muted member counted as muted, 2 households", ids(rep) === [a.admin.userId, a.member.userId, b.admin.userId].sort((x, y) => x - y).join() && rep.muted === 1 && rep.households === 2, rep);
    rep = await audience({ kind: "users", ids: [a.admin.userId, operatorRow.id, invitee.userId, b.member.userId] });
    r.check("picked people: the operator and the invitee skipped, the muted one muted, one left", ids(rep) === String(a.admin.userId) && rep.skipped === 2 && rep.muted === 1, rep);
    rep = await audience({ kind: "households", ids: [] });
    r.check("nothing ticked → nobody", rep.to.length === 0 && rep.households === 0);

    r.section("admin: the operator's note: what goes out");
    const draft = { subject: `Note ${RUN}`, body: "First paragraph.\n\nSecond one.", linkLabel: `Open ${BRAND.name}`, linkUrl: BRAND.url };
    let rec = recorder();
    let sentOut = await sendOperatorNote(operatorRow, draft, { kind: "households", ids: [a.id] }, { mailer: rec.mailer, paceMs: 0 });
    r.check("a household's note: one operator_note per joined member, replies to the contact address", sentOut.sent === 2 && sentOut.failed === 0 && !sentOut.preview && rec.sent.length === 2 && rec.sent.every((m) => m.kind === "operator_note" && m.replyTo === BRAND.contactEmail && m.subject === draft.subject), { sentOut, sent: rec.sent });
    r.check("…each with a user-scoped `updates` unsubscribe for its recipient", rec.sent.every((m) => m.unsubscribe && "userId" in m.unsubscribe && m.unsubscribe.category === "updates" && emails.find((e) => e.id === (m.unsubscribe as { userId: number }).userId)?.email === m.to), rec.sent.map((m) => m.unsubscribe));
    r.check("…and the report carries the audience's facts", sentOut.households === 1 && sentOut.muted === 0 && sentOut.skipped === 1, sentOut);
    rec = recorder();
    sentOut = await sendOperatorNote(operatorRow, { ...draft, replyTo: ` Me@Example.com ` }, { kind: "everyone" }, { preview: true, mailer: rec.mailer, paceMs: 0 });
    r.check("a preview: one copy to the operator, nobody else, the typed reply address normalized", sentOut.preview && sentOut.sent === 1 && rec.sent.length === 1 && rec.sent[0].to === operatorEmail && rec.sent[0].replyTo === "me@example.com", rec.sent);
    rec = recorder({ fail: (to) => to === emails.find((e) => e.id === a.member.userId)!.email });
    sentOut = await sendOperatorNote(operatorRow, draft, { kind: "households", ids: [a.id] }, { mailer: rec.mailer, paceMs: 0 });
    r.check("a failed send is counted, the rest still go", sentOut.sent === 1 && sentOut.failed === 1 && rec.failed.length === 1, sentOut);
    await refused("no subject, no message → both, one line each", () => sendOperatorNote(operatorRow, { subject: " ", body: "" }, { kind: "everyone" }, { preview: true, mailer: recorder().mailer }), /Add a subject\.\nWrite the message\./);
    await refused("a button needs an https address and a label", () => sendOperatorNote(operatorRow, { ...draft, linkUrl: "http://x.test", linkLabel: "" }, { kind: "everyone" }, { preview: true, mailer: recorder().mailer }), /label[^]*https/);
    await refused("a bad reply address", () => sendOperatorNote(operatorRow, { ...draft, replyTo: "nope" }, { kind: "everyone" }, { preview: true, mailer: recorder().mailer }), /reply address/);
    await refused("nobody reachable → refused before anything is sent", () => sendOperatorNote(operatorRow, draft, { kind: "users", ids: [invitee.userId, b.member.userId] }, { mailer: recorder().mailer }), /Nobody to email.*turned updates off/);

    r.section("admin: the operator's note: the waitlist (0018)");
    const [w1, w2, w3] = [email("adm-wait-1"), email("adm-wait-2"), email("adm-wait-3")];
    const mine = (e: string) => [w1, w2, w3].includes(e);
    await owner`INSERT INTO waitlist (email, notified_at) VALUES (${w1}, NULL), (${w2}, NULL), (${w3}, now())`;
    rep = await audience({ kind: "waitlist" });
    r.check("the waitlist audience: every address not yet told, no account or name behind it; the told one counted, not sent", rep.to.filter((t) => mine(t.email)).length === 2 && rep.to.every((t) => t.userId === null && t.name === null) && !rep.to.some((t) => t.email === w3) && rep.told >= 1 && rep.households === 0, { to: rep.to.filter((t) => mine(t.email)), told: rep.told });
    rec = recorder();
    sentOut = await sendOperatorNote(operatorRow, draft, { kind: "waitlist" }, { mailer: rec.mailer, paceMs: 0, only: (t) => mine(t.email) });
    r.check("a waitlist note: one waitlist_note per address waiting, each with a take-me-off scope for its own address, replies to the contact address", sentOut.audience === "waitlist" && sentOut.sent === 2 && rec.sent.length === 2 && rec.sent.every((m) => m.kind === "waitlist_note" && m.replyTo === BRAND.contactEmail && m.unsubscribe && "waitlistEmail" in m.unsubscribe && m.unsubscribe.waitlistEmail === m.to && m.unsubscribe.category === "waitlist"), { sentOut, sent: rec.sent });
    const stamped = await owner<{ email: string; n: Date | null }[]>`SELECT email, notified_at AS n FROM waitlist WHERE email IN (${w1}, ${w2})`;
    r.check("…and each address is stamped notified_at", stamped.length === 2 && stamped.every((s) => s.n !== null), stamped);
    rep = await audience({ kind: "waitlist" });
    r.check("…so a second resolve finds none of them waiting", !rep.to.some((t) => mine(t.email)) && rep.told >= 3, rep.told);
    rec = recorder();
    sentOut = await sendOperatorNote(operatorRow, draft, { kind: "waitlist" }, { preview: true, mailer: rec.mailer, paceMs: 0 });
    r.check("a waitlist preview: one waitlist_note to the operator, with no name, nothing stamped", sentOut.preview && sentOut.sent === 1 && rec.sent.length === 1 && rec.sent[0].kind === "waitlist_note" && rec.sent[0].to === operatorEmail && !!rec.sent[0].unsubscribe && "waitlistEmail" in rec.sent[0].unsubscribe && rec.sent[0].unsubscribe.waitlistEmail === operatorEmail, rec.sent[0]);
    rec = recorder({ fail: (to) => to === w1 });
    await owner`UPDATE waitlist SET notified_at = NULL WHERE email IN (${w1}, ${w2})`;
    sentOut = await sendOperatorNote(operatorRow, draft, { kind: "waitlist" }, { mailer: rec.mailer, paceMs: 0, only: (t) => mine(t.email) });
    const waitAfter = await owner<{ email: string; n: Date | null }[]>`SELECT email, notified_at AS n FROM waitlist WHERE email IN (${w1}, ${w2}) ORDER BY email`;
    r.check("a failed waitlist send leaves that address waiting; the one that went out is stamped", sentOut.sent === 1 && sentOut.failed === 1 && waitAfter.find((x) => x.email === w1)?.n === null && waitAfter.find((x) => x.email === w2)?.n !== null, waitAfter);
    await owner`DELETE FROM waitlist WHERE email IN (${w1}, ${w2}, ${w3})`;
    r.section("admin: the operator's note: the day's ceiling");
    const now = new Date();
    const unpad = () => owner`DELETE FROM email_log WHERE to_hash = ${BUDGET_MARK} AND kind = ${BUDGET_KIND}`;
    const padTo = async (total: number) => {
      await unpad();
      const real = await withUser(operatorRow.id, (tx) => sendsToday(tx, now));
      if (total > real) await owner`INSERT INTO email_log (household_id, kind, to_hash, ok) SELECT NULL, ${BUDGET_KIND}, ${BUDGET_MARK}, true FROM generate_series(1, ${total - real})`;
    };
    const used = await withUser(operatorRow.id, (tx) => sendsToday(tx, now));
    if (used + 2 > BULK_DAILY_LIMIT) r.check("budget checks need headroom today", false, `${used} sends already today on dev`);
    else {
      try {
        await padTo(BULK_DAILY_LIMIT - 1); // two to send → 61
        await refused(`over ${BULK_DAILY_LIMIT} for the UTC day → refused, naming the count`, () => sendOperatorNote(operatorRow, draft, { kind: "households", ids: [a.id] }, { now, mailer: recorder().mailer, paceMs: 0 }), /near the app's own ceiling.*2 to send/);
        rec = recorder();
        sentOut = await sendOperatorNote(operatorRow, draft, { kind: "everyone" }, { now, preview: true, mailer: rec.mailer, paceMs: 0 });
        r.check("…while a preview, one send, still fits", sentOut.sent === 1 && rec.sent.length === 1, sentOut);
        await padTo(BULK_DAILY_LIMIT - 2); // two to send → exactly 60
        rec = recorder();
        sentOut = await sendOperatorNote(operatorRow, draft, { kind: "households", ids: [a.id] }, { now, mailer: rec.mailer, paceMs: 0 });
        r.check(`exactly ${BULK_DAILY_LIMIT} → sends`, sentOut.sent === 2 && rec.sent.length === 2, sentOut);
      } finally {
        await unpad();
      }
    }
    await owner`UPDATE users SET muted_kinds = '{}' WHERE id = ${b.member.userId}`;
  } finally {
    if (savedList === undefined) delete process.env.SUPERADMIN_EMAILS;
    else process.env.SUPERADMIN_EMAILS = savedList;
  }

  r.section("admin: the cron tick stamps its outcome");
  await tick({ only: [a.id], mailer: recorder().mailer });
  const [{ outcome }] = await owner<{ outcome: string | null }[]>`SELECT last_tick_outcome AS outcome FROM households WHERE id = ${a.id}`;
  r.check("last_tick_outcome is one line starting with the result", !!outcome && /^(sent \d|skipped: |deferred: |error: )/.test(outcome), outcome);

  r.section("admin: who is the operator");
  const saved = process.env.SUPERADMIN_EMAILS;
  try {
    process.env.SUPERADMIN_EMAILS = "";
    r.check("no list → nobody", superadminEmails().size === 0 && !isSuperadmin({ email: "x@y.z" }));
    process.env.SUPERADMIN_EMAILS = " Op@Example.com , second@example.com,,not-an-email ";
    r.check("the list is normalized: case and spaces don't matter, junk is dropped", superadminEmails().size === 2 && isSuperadmin({ email: "op@example.COM" }) && isSuperadmin({ email: "second@example.com" }));
    r.check("anyone else is not the operator", !isSuperadmin({ email: "x@example.com" }) && !isSuperadmin({ email: "" }));
  } finally {
    if (saved === undefined) delete process.env.SUPERADMIN_EMAILS;
    else process.env.SUPERADMIN_EMAILS = saved;
  }
}
