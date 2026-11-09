"use server";

import { createElement } from "react";
import Invite from "@/emails/Invite";
import { householdDate, readOnlyReason, requireAdminAction, requireUserAction } from "@/lib/auth";
import { type BillType, removeBillType, saveBillType } from "@/lib/bills";
import { BRAND } from "@/lib/brand";
import type { Ctx } from "@/lib/context";
import { withHousehold, type Tx } from "@/lib/db";
import {
  approveDeletion,
  cancelDeletion,
  deleteAlone,
  leaveHousehold,
  removeMembership,
  requestDeletion,
  sendDeletionMail,
  undoDeletion,
} from "@/lib/deletion";
import { attempt, done, fail } from "@/lib/flash";
import { GATE_REFUSAL, signinAllowed } from "@/lib/gate";
import { OPERATOR_INVITE_REFUSAL, isSuperadmin } from "@/lib/superadmin";
import { getUserByEmail } from "@/lib/households";
import { normalizeEmail } from "@/lib/login-codes";
import { sendMail } from "@/lib/mail";
import { householdPath } from "@/lib/paths";
import type { Role } from "@/lib/types";

// Household-level actions: members (/{slug}/household, the Members page), and the utilities,
// leaving and deleting that live at the end of Settings (/{slug}/household/settings). Each
// action authorizes itself (proxy.ts is only the first lock), refuses politely while the
// household is read-only (the demo, or marked for deletion: readOnlyReason), and reports through
// ?ok= / ?err= (lib/flash.ts). The deletion actions skip that check: lib/deletion.ts decides.

const members = (ctx: Ctx) => householdPath(ctx.household, "/household");
const settings = (ctx: Ctx) => householdPath(ctx.household, "/household/settings");
const ROLES: Role[] = ["admin", "member"];

async function adminCtx(path: (ctx: Ctx) => string): Promise<Ctx> {
  const ctx = await requireAdminAction();
  const no = readOnlyReason(ctx);
  if (no) fail(path(ctx), no);
  return ctx;
}

function sendInvite(ctx: Ctx, invitee: { email: string; name: string }): Promise<boolean> {
  return sendMail({
    ctx,
    to: invitee.email,
    subject: `${ctx.user.name} added you to ${ctx.household.name} on ${BRAND.name}`,
    react: createElement(Invite, {
      theme: ctx.household.theme,
      householdName: ctx.household.name,
      householdSlug: ctx.household.slug,
      inviterName: ctx.user.name,
      inviteeName: invitee.name,
      email: invitee.email,
    }),
    kind: "invite",
  });
}

interface MemberRow {
  id: number;
  userId: number;
  role: Role;
  joinedAt: Date | null;
  email: string;
  name: string;
}

async function getMember(tx: Tx, id: number): Promise<MemberRow | null> {
  const [m] = await tx<MemberRow[]>`
    SELECT m.id, m.user_id AS "userId", m.role, m.joined_at AS "joinedAt", u.email, u.name
    FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.id = ${id} AND m.household_id = app_household_id()`;
  return m ?? null;
}

/**
 * Invite by email: the users row is created up front (an admin vouched for the address; the
 * name only applies if the person is new here) plus a pending membership. Signing in with
 * that email accepts it.
 */
export async function inviteMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(members);
  const name = String(formData.get("name") ?? "").trim();
  const email = normalizeEmail(formData.get("email"));
  const role = String(formData.get("role")) as Role;
  const splitsBills = formData.get("splitsBills") === "on";
  if (!name || name.length > 80) fail(members(ctx), "Enter a name (up to 80 characters).");
  if (!email) fail(members(ctx), "Enter a valid email address.");
  if (!ROLES.includes(role)) fail(members(ctx), "Pick a role.");
  if (isSuperadmin({ email })) fail(members(ctx), OPERATOR_INVITE_REFUSAL);
  if (!signinAllowed(email)) fail(members(ctx), `${GATE_REFUSAL} Invites can only go to addresses on the launch list for now.`);

  const { invitee, created } = await withHousehold(ctx, async (tx) => {
    await tx`INSERT INTO users (email, name) VALUES (${email}, ${name}) ON CONFLICT (email) DO NOTHING`;
    const invitee = (await getUserByEmail(tx, email))!;
    const rows = await tx`
      INSERT INTO memberships (household_id, user_id, role, splits_bills, invited_by)
      VALUES (${ctx.household.id}, ${invitee.id}, ${role}, ${splitsBills}, ${ctx.membership.id})
      ON CONFLICT (household_id, user_id) DO NOTHING
      RETURNING id`;
    return { invitee, created: rows.length > 0 };
  });
  if (!created) fail(members(ctx), `${email} is already in ${ctx.household.name}.`);

  if (!(await sendInvite(ctx, invitee))) {
    fail(members(ctx), `Added ${invitee.name}, but the invite email didn't send. Try "Resend invite" in a minute.`);
  }
  done(members(ctx), `Invited ${invitee.name} (${invitee.email}).`);
}

export async function resendInvite(formData: FormData): Promise<void> {
  const ctx = await adminCtx(members);
  const member = await withHousehold(ctx, (tx) => getMember(tx, Number(formData.get("membershipId"))));
  if (!member) fail(members(ctx), "That member is no longer in this household.");
  if (member.joinedAt) fail(members(ctx), `${member.name} has already joined.`);
  if (isSuperadmin(member)) fail(members(ctx), OPERATOR_INVITE_REFUSAL);
  if (!signinAllowed(member.email)) fail(members(ctx), `${GATE_REFUSAL} Invites can only go to addresses on the launch list for now.`);
  if (!(await sendInvite(ctx, member))) fail(members(ctx), "The invite email didn't send. Try again in a minute.");
  done(members(ctx), `Sent ${member.name} a new invite.`);
}

/**
 * Role and splits_bills. Names belong to their owners (/account): users.name is shared across
 * households, so one household's admin can't rename someone everywhere.
 */
export async function updateMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(members);
  const id = Number(formData.get("membershipId"));
  const role = String(formData.get("role")) as Role;
  const splitsBills = formData.get("splitsBills") === "on";
  if (!ROLES.includes(role)) fail(members(ctx), "Pick a role.");

  const outcome = await withHousehold(ctx, async (tx) => {
    const member = await getMember(tx, id);
    if (!member) return "missing" as const;
    if (member.role === "admin" && role === "member") {
      // Someone who has signed in must stay able to run the household. Lock the admin rows
      // so two concurrent demotions can't both pass.
      const admins = await tx<{ id: number }[]>`
        SELECT id FROM memberships
        WHERE role = 'admin' AND joined_at IS NOT NULL AND id <> ${id}
        FOR UPDATE`;
      if (admins.length === 0) return "last-admin" as const;
    }
    await tx`UPDATE memberships SET role = ${role}, splits_bills = ${splitsBills} WHERE id = ${id}`;
    return member;
  });
  if (outcome === "missing") fail(members(ctx), "That member is no longer in this household.");
  if (outcome === "last-admin") fail(members(ctx), "Make someone else an admin first: a household needs one.");
  done(members(ctx), `Updated ${outcome.name}.`);
}

/**
 * Removes a membership (lib/deletion.ts removeMembership): their debt rows and queued thanks
 * cascade away; bill types they owned, bills they posted and documents they uploaded stay. If
 * they were the last vote a deletion request was waiting on, the household is marked.
 */
export async function removeMember(formData: FormData): Promise<void> {
  const ctx = await adminCtx(members);
  const id = Number(formData.get("membershipId"));
  if (id === ctx.membership.id) fail(members(ctx), "To leave, use Leave household at the end of Settings.");

  const result = await withHousehold(ctx, async (tx) => {
    const member = await getMember(tx, id);
    if (!member) return null;
    return { member, ...(await removeMembership(tx, id)) };
  });
  if (!result) fail(members(ctx), "That member is no longer in this household.");
  const { member, owned, openBills, marked } = result;
  if (marked) await sendDeletionMail(ctx, { event: "marked", actor: null, deleteAfter: marked });
  const orphaned =
    (owned ? ` ${owned} bill type${owned === 1 ? "" : "s"} they owned now ${owned === 1 ? "has" : "have"} no owner.` : "") +
    (openBills ? ` ${openBills} open bill${openBills === 1 ? " is" : "s are"} still owed to them, shown as "former member".` : "") +
    (marked ? ` Everyone left had approved deleting ${ctx.household.name}, so it's deleted on ${householdDate(ctx, marked)}.` : "");
  done(members(ctx), `Removed ${member.name}.${orphaned}`);
}

// ---------------------------------------------------------------------------------------------
// Utilities (bill types), in Settings

export async function saveBillTypeAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx(settings);
  const id = Number(formData.get("typeId")) || undefined;
  const ownerRaw = String(formData.get("ownerId") ?? "");
  const fee = String(formData.get("processingFee") ?? "0").trim();
  const type: BillType = await attempt(settings(ctx), () =>
    withHousehold(ctx, (tx) =>
      saveBillType(tx, ctx, {
        id,
        name: String(formData.get("name") ?? ""),
        emoji: String(formData.get("emoji") ?? ""),
        processingFee: fee === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(fee) ? Number(fee) : NaN,
        ownerId: ownerRaw ? Number(ownerRaw) : null,
        // The checkbox is only on the form while Trends is on; without it the setting is kept.
        inTrends: formData.has("trendsField") ? formData.get("inTrends") === "on" : undefined,
      }),
    ),
  );
  done(settings(ctx), `${id ? "Updated" : "Added"} ${type.emoji ? `${type.emoji} ` : ""}${type.name}.`);
}

export async function removeBillTypeAction(formData: FormData): Promise<void> {
  const ctx = await adminCtx(settings);
  const name = await attempt(settings(ctx), () => withHousehold(ctx, (tx) => removeBillType(tx, ctx, Number(formData.get("typeId")))));
  done(settings(ctx), `Removed ${name}.`);
}

// ---------------------------------------------------------------------------------------------
// Leaving and deleting (lib/deletion.ts). Everyone who has joined votes, so these take any
// member; the library checks the rest. Mail goes out after the change commits.

const me = (ctx: Ctx) => ({ membershipId: ctx.membership.id, name: ctx.user.name });

/** Leave the household. Anyone but its last joined admin. Lands on /households. */
export async function leaveAction(): Promise<void> {
  const ctx = await requireUserAction();
  const { marked } = await attempt(settings(ctx), () => withHousehold(ctx, (tx) => leaveHousehold(tx, ctx)));
  if (marked) await sendDeletionMail(ctx, { event: "marked", actor: null, deleteAfter: marked });
  done("/households", `You left ${ctx.household.name}.`);
}

/** The only joined member deletes by typing the name; it's marked, with a week to undo. */
export async function deleteAloneAction(formData: FormData): Promise<void> {
  const ctx = await requireUserAction();
  const deleteAfter = await attempt(settings(ctx), () =>
    withHousehold(ctx, (tx) => deleteAlone(tx, ctx, String(formData.get("confirmName") ?? ""))),
  );
  await sendDeletionMail(ctx, { event: "marked", actor: me(ctx), deleteAfter });
  done(settings(ctx), `${ctx.household.name} will be deleted on ${householdDate(ctx, deleteAfter)}. Until then it's read-only, and you can undo it.`);
}

export async function requestDeletionAction(): Promise<void> {
  const ctx = await requireUserAction();
  const outcome = await attempt(settings(ctx), () => withHousehold(ctx, (tx) => requestDeletion(tx, ctx)));
  if (outcome.kind === "marked") {
    await sendDeletionMail(ctx, { event: "marked", actor: null, deleteAfter: outcome.deleteAfter });
    done(settings(ctx), `${ctx.household.name} will be deleted on ${householdDate(ctx, outcome.deleteAfter)}.`);
  }
  const mail = await sendDeletionMail(ctx, { event: "requested", actor: me(ctx), expiresAt: outcome.expiresAt });
  done(
    settings(ctx),
    `Asked everyone to approve deleting ${ctx.household.name}. It's deleted only if everyone who has joined approves by ${householdDate(ctx, outcome.expiresAt)}.` +
      (mail.failed ? ` ${mail.failed} email${mail.failed === 1 ? "" : "s"} didn't send; the request shows on the household for everyone.` : ""),
  );
}

export async function approveDeletionAction(): Promise<void> {
  const ctx = await requireUserAction();
  const marked = await attempt(settings(ctx), () => withHousehold(ctx, (tx) => approveDeletion(tx, ctx)));
  if (!marked) done(settings(ctx), `You approved deleting ${ctx.household.name}. It's deleted once everyone has approved.`);
  await sendDeletionMail(ctx, { event: "marked", actor: null, deleteAfter: marked });
  done(settings(ctx), `Everyone approved. ${ctx.household.name} will be deleted on ${householdDate(ctx, marked)}; until then it's read-only, and an admin can undo it.`);
}

export async function cancelDeletionAction(): Promise<void> {
  const ctx = await requireUserAction();
  await attempt(settings(ctx), () => withHousehold(ctx, (tx) => cancelDeletion(tx, ctx)));
  await sendDeletionMail(ctx, { event: "cancelled", actor: me(ctx) });
  done(settings(ctx), `Cancelled the request. ${ctx.household.name} stays.`);
}

export async function undoDeletionAction(): Promise<void> {
  const ctx = await requireUserAction();
  await attempt(settings(ctx), () => withHousehold(ctx, (tx) => undoDeletion(tx, ctx)));
  await sendDeletionMail(ctx, { event: "undone", actor: me(ctx) });
  done(settings(ctx), `${ctx.household.name} is no longer being deleted.`);
}
