// Deleting a household, and leaving one (0009, ARCHITECTURE.md §5), library level: the sole
// member's typed-name delete, the vote (approve, cancel, lapse), the read-only week and its undo,
// the cron's hard delete (rows and the h/{id}/ Blob prefix), leaving (the last admin can't), and a
// static guard that no action refuses only the demo. Every send goes through a recording Mailer,
// and the tick only runs for fixture ids.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { list } from "@vercel/blob";
import { readOnlyReason } from "@/lib/auth";
import { createBill, getPayer, saveBillType, setPaid } from "@/lib/bills";
import { billPdfKey, householdPrefix, putBillPdf } from "@/lib/blob";
import type { Ctx } from "@/lib/context";
import { tick } from "@/lib/cron";
import { withHousehold } from "@/lib/db";
import {
  GRACE_DAYS,
  approveDeletion,
  cancelDeletion,
  deleteAlone,
  getDeletionState,
  leaveHousehold,
  requestDeletion,
  sendDeletionMail,
  undoDeletion,
} from "@/lib/deletion";
import { DEMO_REFUSAL, demoCtx } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { parseSettings, saveSettings, settingsFormFrom } from "@/lib/settings";
import { RUN, type Results, type Sql, addMember, ctxFor, email, makeHousehold, recorder } from "./harness";

const ROOT = path.join(import.meta.dirname, "..", "..");
const DAY = 86_400_000;

export async function deletion(r: Results, { owner }: { owner: Sql }) {
  const refused = async (name: string, fn: () => Promise<unknown>, re: RegExp) =>
    r.throws(name, async () => {
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof ActionError)) throw new Error(`not an ActionError: ${e instanceof Error ? e.message : e}`);
        throw e;
      }
    }, re);
  const tx = <T>(ctx: Ctx, fn: Parameters<typeof withHousehold<T>>[1]) => withHousehold(ctx, fn);
  const row = async (id: number) =>
    (await owner<{ requested: boolean; deleteAfter: Date | null; approvals: number }[]>`
      SELECT deletion_requested_at IS NOT NULL AS requested, delete_after AS "deleteAfter",
             (SELECT count(*)::int FROM deletion_approvals WHERE household_id = ${id}) AS approvals
      FROM households WHERE id = ${id}`)[0];
  const to = (sent: { to: string }[]) => sent.map((s) => s.to).sort();

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: the only joined member types the name");
  const solo = await makeHousehold(owner, "ds");
  await owner`DELETE FROM memberships WHERE id = ${solo.member.membershipId}`;
  await addMember(owner, solo, `ds-pending-${RUN}`, { joined: false });
  const soloAdmin = await ctxFor(solo.admin.userId, solo.id);
  await refused("a wrong name is refused", () => tx(soloAdmin, (t) => deleteAlone(t, soloAdmin, "Something else")), /exactly/);
  r.check("…and nothing is marked", (await row(solo.id)).deleteAfter === null);
  const soloOn = await tx(soloAdmin, (t) => deleteAlone(t, soloAdmin, ` ${soloAdmin.household.name} `));
  const days = (soloOn.getTime() - Date.now()) / DAY;
  r.check(`the exact name marks it ${GRACE_DAYS} days out (a pending invite doesn't count)`, Math.abs(days - GRACE_DAYS) < 0.01, days);
  let rec = recorder();
  await sendDeletionMail(soloAdmin, { event: "marked", actor: { membershipId: solo.admin.membershipId, name: "x" }, deleteAfter: soloOn }, { mailer: rec.mailer });
  r.check("the 'marked' email confirms to the member who did it, and not to the pending invite", to(rec.sent).join() === email("ds-admin"), to(rec.sent));

  const pair = await makeHousehold(owner, "dp");
  const pairAdmin = await ctxFor(pair.admin.userId, pair.id);
  await refused("with two joined members, typing the name is refused", () => tx(pairAdmin, (t) => deleteAlone(t, pairAdmin, pairAdmin.household.name)), /everyone's approval/);
  await refused("…and a request needs an admin", async () => {
    const m = await ctxFor(pair.member.userId, pair.id);
    await tx(m, (t) => requestDeletion(t, m));
  }, /admin/);

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: the vote");
  const v = await makeHousehold(owner, "dv");
  const third = await addMember(owner, v, `dv-third-${RUN}`);
  await addMember(owner, v, `dv-pending-${RUN}`, { joined: false });
  const vAdmin = await ctxFor(v.admin.userId, v.id);
  const vMember = await ctxFor(v.member.userId, v.id);
  const vThird = await ctxFor(third.userId, v.id);

  const asked = await tx(vAdmin, (t) => requestDeletion(t, vAdmin));
  r.check("an admin's request opens for 14 days", asked.kind === "requested" && Math.abs((asked.expiresAt.getTime() - Date.now()) / DAY - 14) < 0.01, asked);
  let state = await tx(vAdmin, (t) => getDeletionState(t));
  r.check("three joined voters, the requester already approving; the pending invite doesn't vote",
    state.request?.voters.length === 3 && state.request.voters.filter((x) => x.approved).map((x) => x.id).join() === String(v.admin.membershipId), state.request?.voters);
  rec = recorder();
  await sendDeletionMail(vAdmin, { event: "requested", actor: { membershipId: v.admin.membershipId, name: "Admin" }, expiresAt: asked.kind === "requested" ? asked.expiresAt : undefined }, { mailer: rec.mailer });
  r.check("the request emails the other joined members only", to(rec.sent).join() === [email("dv-member"), email(`dv-third-${RUN}`)].sort().join(), to(rec.sent));
  await refused("a second request is refused", () => tx(vAdmin, (t) => requestDeletion(t, vAdmin)), /already/);

  r.check("one approval of two isn't enough", (await tx(vMember, (t) => approveDeletion(t, vMember))) === null);
  await tx(vMember, (t) => cancelDeletion(t, vMember));
  let h = await row(v.id);
  r.check("someone who approved can still cancel: the request and approvals are gone", !h.requested && h.approvals === 0 && h.deleteAfter === null, h);
  await refused("approving with no request open is refused", () => tx(vThird, (t) => approveDeletion(t, vThird)), /no open request/);

  await tx(vAdmin, (t) => requestDeletion(t, vAdmin));
  await tx(vMember, (t) => approveDeletion(t, vMember));
  const vOn = await tx(vThird, (t) => approveDeletion(t, vThird));
  h = await row(v.id);
  r.check("the last approval marks it and clears the request", vOn instanceof Date && h.deleteAfter !== null && !h.requested && h.approvals === 0, h);
  rec = recorder();
  await sendDeletionMail(vAdmin, { event: "marked", actor: null, deleteAfter: vOn! }, { mailer: rec.mailer });
  r.check("the 'marked' email goes to all three joined members", rec.sent.length === 3 && rec.sent.every((s) => s.kind === "household_deletion"), to(rec.sent));

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: marked households are read-only");
  const frozen = await ctxFor(v.admin.userId, v.id);
  const frozenMember = await ctxFor(v.member.userId, v.id);
  r.check("readOnlyReason names the day", /being deleted on .*read-only/.test(readOnlyReason(frozen) ?? ""), readOnlyReason(frozen));
  r.check("the demo still reads as the demo", readOnlyReason(demoCtx()) === DEMO_REFUSAL);
  await refused("posting a bill is refused", () => tx(frozen, (t) => createBill(t, frozen, { typeId: v.typeId, amount: 10, billDate: "2030-01-01", dueDate: "2030-01-20" })), /being deleted/);
  await refused("marking a payment is refused", () => tx(frozen, (t) => setPaid(t, frozen, v.billId, v.member.membershipId, true)), /being deleted/);
  await refused("saving a bill type is refused", () => tx(frozen, (t) => saveBillType(t, frozen, { name: "Nope", emoji: "❌", processingFee: 0, ownerId: null })), /being deleted/);
  await refused("saving settings is refused", async () => {
    const payer = await tx(frozen, (t) => getPayer(t));
    const input = parseSettings(settingsFormFrom(frozen.household, payer));
    await tx(frozen, (t) => saveSettings(t, frozen, input));
  }, /being deleted/);
  await refused("leaving is refused", () => tx(frozenMember, (t) => leaveHousehold(t, frozenMember)), /being deleted/);
  await refused("requesting again is refused", () => tx(frozen, (t) => requestDeletion(t, frozen)), /being deleted/);
  await refused("a member can't undo", () => tx(frozenMember, (t) => undoDeletion(t, frozenMember)), /admin/);

  r.section("deletion: a marked household waits its week in the cron");
  rec = recorder();
  let report = await tick({ only: [v.id], mailer: rec.mailer });
  const vt = report.households[0];
  r.check("the tick skips it and sends nothing", "skipped" in vt && vt.skipped === "marked for deletion" && rec.sent.length === 0, vt);
  r.check("…and it's still there", (await row(v.id)) !== undefined);

  await tx(frozen, (t) => undoDeletion(t, frozen));
  h = await row(v.id);
  r.check("an admin's undo clears the mark", h.deleteAfter === null, h);
  const live = await ctxFor(v.admin.userId, v.id);
  r.check("…and it's writable again", readOnlyReason(live) === null);
  rec = recorder();
  await sendDeletionMail(live, { event: "undone", actor: { membershipId: v.admin.membershipId, name: "Admin" } }, { mailer: rec.mailer });
  r.check("the 'undone' email goes to everyone but the admin who undid it", rec.sent.length === 2 && !to(rec.sent).includes(email("dv-admin")), to(rec.sent));

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: a request lapses after 14 days");
  await tx(live, (t) => requestDeletion(t, live));
  await owner`UPDATE households SET deletion_requested_at = now() - interval '15 days' WHERE id = ${v.id}`;
  state = await tx(live, (t) => getDeletionState(t));
  r.check("a lapsed request reads as none", state.request === null);
  await refused("approving a lapsed request is refused", () => tx(vMember, (t) => approveDeletion(t, vMember)), /no open request/);
  rec = recorder();
  report = await tick({ only: [v.id], mailer: rec.mailer });
  h = await row(v.id);
  r.check("the tick clears it", "expired" in report.households[0] && report.households[0].expired === true && !h.requested && h.approvals === 0, { tick: report.households[0], h });
  r.check("…and emails every joined member that it lapsed", rec.sent.filter((s) => s.kind === "household_deletion").length === 3, to(rec.sent));
  rec = recorder();
  report = await tick({ only: [v.id], mailer: rec.mailer });
  r.check("the next tick doesn't email again", !("expired" in report.households[0] && report.households[0].expired) && !rec.sent.some((s) => s.kind === "household_deletion"));

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: leaving");
  const l = await makeHousehold(owner, "dl");
  const lThird = await addMember(owner, l, `dl-third-${RUN}`);
  const lAdmin = await ctxFor(l.admin.userId, l.id);
  const lMember = await ctxFor(l.member.userId, l.id);
  await refused("the last joined admin can't leave", () => tx(lAdmin, (t) => leaveHousehold(t, lAdmin)), /last admin/);
  await tx(lAdmin, (t) => requestDeletion(t, lAdmin));
  const lt = await ctxFor(lThird.userId, l.id);
  await tx(lt, (t) => approveDeletion(t, lt));
  const left = await tx(lMember, (t) => leaveHousehold(t, lMember));
  r.check("the last holdout leaving completes the vote", left.marked instanceof Date && (await row(l.id)).deleteAfter !== null, left);
  const [after] = await owner<{ members: number; debts: number; status: string }[]>`
    SELECT (SELECT count(*)::int FROM memberships WHERE id = ${l.member.membershipId}) AS members,
           (SELECT count(*)::int FROM bill_debts WHERE bill_id = ${l.billId}) AS debts,
           (SELECT status FROM bills WHERE id = ${l.billId}) AS status`;
  r.check("their membership and debt rows are gone, and the bill they alone owed on is paid", after.members === 0 && after.debts === 0 && after.status === "paid", after);
  const promoted = await makeHousehold(owner, "dk");
  await owner`UPDATE memberships SET role = 'admin' WHERE id = ${promoted.member.membershipId}`;
  const second = await ctxFor(promoted.admin.userId, promoted.id);
  r.check("an admin can leave once someone else is an admin", (await tx(second, (t) => leaveHousehold(t, second))).marked === null);

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: the cron deletes the rows and the Blob prefix");
  const key = billPdfKey(l.id, "Gas", "2030-01-01", l.billId);
  await putBillPdf(key, new TextEncoder().encode(`%PDF-1.4\n% verify ${RUN}\n%%EOF\n`).buffer as ArrayBuffer);
  const before = await list({ prefix: householdPrefix(l.id) });
  r.check("a blob sits under the household's prefix", before.blobs.length > 0, before.blobs.length);
  const logIds = (await owner<{ id: number }[]>`SELECT id FROM email_log WHERE household_id = ${l.id}`).map((x) => x.id);
  await owner`UPDATE households SET delete_after = now() - interval '1 minute' WHERE id = ${l.id}`;
  await refused("once the day has passed, undo is too late", async () => {
    const c = await ctxFor(l.admin.userId, l.id);
    await tx(c, (t) => undoDeletion(t, c));
  }, /too late/);
  report = await tick({ only: [l.id], mailer: recorder().mailer });
  r.check("the tick reports it deleted", "deleted" in report.households[0] && report.households[0].deleted === true, report.households[0]);
  const [gone] = await owner<{ households: number; memberships: number; bills: number; types: number; approvals: number; users: number; logs: number }[]>`
    SELECT (SELECT count(*)::int FROM households WHERE id = ${l.id}) AS households,
           (SELECT count(*)::int FROM memberships WHERE household_id = ${l.id}) AS memberships,
           (SELECT count(*)::int FROM bills WHERE household_id = ${l.id}) AS bills,
           (SELECT count(*)::int FROM bill_types WHERE household_id = ${l.id}) AS types,
           (SELECT count(*)::int FROM deletion_approvals WHERE household_id = ${l.id}) AS approvals,
           (SELECT count(*)::int FROM users WHERE id IN (${l.admin.userId}, ${lThird.userId})) AS users,
           (SELECT count(*)::int FROM email_log WHERE id = ANY(${logIds}) AND household_id IS NULL) AS logs`;
  r.check("every row of the household is gone", gone.households + gone.memberships + gone.bills + gone.types + gone.approvals === 0, gone);
  r.check("the people stay (they may be in other households)", gone.users === 2, gone.users);
  r.check("its email_log rows survive with no household (the daily budget still counts them)", logIds.length > 0 && gone.logs === logIds.length, { gone: gone.logs, had: logIds.length });
  const afterBlobs = await list({ prefix: householdPrefix(l.id) });
  r.check("its Blob prefix is empty", afterBlobs.blobs.length === 0, afterBlobs.blobs.map((b) => b.pathname));

  // ---------------------------------------------------------------------------------------------
  r.section("deletion: outsiders and the static guard");
  await r.throws("a member of another household gets no context here", () => ctxFor(pair.admin.userId, v.id), /not in household/);
  const actions: string[] = [];
  const walk = (p: string) => {
    for (const f of readdirSync(p)) {
      const full = path.join(p, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f === "actions.ts") actions.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  const demoOnly = actions.filter((f) => /if \(ctx\.demo\)/.test(readFileSync(f, "utf8")));
  r.check(`no action refuses only the demo (${actions.length} action files; readOnlyReason covers marked households too)`, actions.length > 0 && demoOnly.length === 0, demoOnly.map((f) => path.relative(ROOT, f)));
}
