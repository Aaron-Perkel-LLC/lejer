"use server";

import { deleteHouseholdAsOperator, deleteUserAsOperator } from "@/lib/admin";
import { ActionError } from "@/lib/errors";
import { attempt, done } from "@/lib/flash";
import { type Audience, isAudienceKind, sendOperatorNote } from "@/lib/operator-mail";
import { ADMIN_PATH, requireSuperadmin } from "@/lib/superadmin";

// The operator's writes: the two deletes (lib/admin.ts) and the note (lib/operator-mail.ts).
// requireSuperadmin() is the lock: anyone else posting here gets not-found, the same as opening
// the page. Outcomes travel back as ?ok= / ?err=, to the section the action came from (the
// fragment on the path; lib/flash.ts keeps it after the query).

const AT = { people: `${ADMIN_PATH}#people`, households: `${ADMIN_PATH}#households`, email: `${ADMIN_PATH}#email` };

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Deletes an account and every membership it has; the typed address is the confirmation. */
export async function deleteUserAction(formData: FormData): Promise<void> {
  const operator = await requireSuperadmin();
  const { email, households } = await attempt(AT.people, () => deleteUserAsOperator(operator, Number(formData.get("id")), String(formData.get("confirm") ?? "")));
  const seats = households === 0 ? "" : ` and took them out of ${households === 1 ? "1 household" : `${households} households`}`;
  done(AT.people, `Deleted ${email}${seats}.`);
}

/** Deletes a household and its files right now; the typed slug is the confirmation. */
export async function deleteHouseholdAction(formData: FormData): Promise<void> {
  const operator = await requireSuperadmin();
  const h = await attempt(AT.households, () => deleteHouseholdAsOperator(operator, Number(formData.get("id")), String(formData.get("confirm") ?? "")));
  done(AT.households, `Deleted ${h.name} (${h.billCount === 1 ? "1 bill" : `${h.billCount} bills`}, ${h.memberCount === 1 ? "1 member" : `${h.memberCount} members`}).`);
}

const ids = (formData: FormData, name: string) => formData.getAll(name).map(Number).filter((n) => Number.isInteger(n) && n > 0);

/**
 * The compose form: `intent` is "preview" (one copy to the operator) or "send"; `audience`
 * names the set, and the ticked `household` / `user` boxes in the form name its members.
 */
export async function sendOperatorNoteAction(formData: FormData): Promise<void> {
  const operator = await requireSuperadmin();
  const str = (k: string) => String(formData.get(k) ?? "");
  const report = await attempt(AT.email, async () => {
    const intent = str("intent");
    if (intent !== "preview" && intent !== "send") throw new ActionError("Choose Send or Send me a copy.");
    const kind = str("audience");
    if (!isAudienceKind(kind)) throw new ActionError("Pick who it goes to.");
    const audience: Audience = kind === "households" || kind === "users" ? { kind, ids: ids(formData, kind === "households" ? "household" : "user") } : { kind };
    return sendOperatorNote(operator, { subject: str("subject"), body: str("body"), linkLabel: str("linkLabel"), linkUrl: str("linkUrl"), replyTo: str("replyTo") }, audience, { preview: intent === "preview" });
  });
  if (report.preview) done(AT.email, report.sent ? `Sent you a copy at ${operator.email}.` : "The copy didn't send; see the failed sends below.");
  if (report.audience === "waitlist") {
    const notes = [report.failed ? `${report.failed} failed` : "", report.told ? `${report.told} already told` : ""].filter(Boolean);
    done(AT.email, `Sent to ${report.sent} ${report.sent === 1 ? "address" : "addresses"} on the waitlist${notes.length ? ` (${notes.join(", ")})` : ""}.`);
  }
  const notes = [report.failed ? `${report.failed} failed` : "", report.muted ? `${people(report.muted)} turned updates off` : "", report.skipped ? `${report.skipped} unreachable` : ""].filter(Boolean);
  done(AT.email, `Sent to ${people(report.sent)}${notes.length ? ` (${notes.join(", ")})` : ""}.`);
}
