import { notFound, redirect } from "next/navigation";
import { getCtx, getSessionUser, type Ctx } from "@/lib/context";
import type { Tx } from "@/lib/db";
import { DEMO_REFUSAL } from "@/lib/demo";
import { ActionError } from "@/lib/errors";
import { householdPath } from "@/lib/paths";
import { ADMIN_PATH, isSuperadmin } from "@/lib/superadmin";

// Page-level authorization redirects; action-level authorization throws. Every server action
// calls one of the *Action helpers itself: proxy.ts is only the first lock.

/**
 * The household the URL names, for a member of it. Signed in but not a member (or no such
 * household): not found, so a slug never confirms that a household exists. Signed out: login.
 */
export async function requireUser(): Promise<Ctx> {
  const ctx = await getCtx();
  if (ctx) return ctx;
  const user = await getSessionUser();
  if (user && isSuperadmin(user)) redirect(ADMIN_PATH); // operator accounts have no household pages
  if (user) notFound();
  redirect("/login");
}

export async function requireAdmin(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.membership.role !== "admin") redirect(householdPath(ctx.household, "/no-access"));
  return ctx;
}

/** Server actions: any member of the current household (the demo visitor included). */
export async function requireUserAction(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new Error("Sign in required.");
  return ctx;
}

/** Server actions: admins of the current household (the demo viewer is one; actions refuse). */
export async function requireAdminAction(): Promise<Ctx> {
  const ctx = await requireUserAction();
  if (ctx.membership.role !== "admin") throw new Error("Admin access required.");
  return ctx;
}

/** Server actions on one bill type's bills: an admin, or the member who owns that type. */
export async function requireBillManager(tx: Tx, typeId: number): Promise<Ctx> {
  const ctx = await requireUserAction();
  await assertBillManager(tx, ctx, typeId);
  return ctx;
}

/** A date in the household's own calendar, for refusals and banners ("Tuesday, October 20"). */
export function householdDate(ctx: Pick<Ctx, "household">, d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: ctx.household.timezone });
}

/**
 * Why nothing in this household can change right now, or null when it can: the demo, or a
 * household marked for deletion (lib/deletion.ts), which stays readable but frozen until the
 * cron deletes it. Every action checks this where it used to check ctx.demo, and the assert*
 * helpers below throw it, so library callers are covered too. Undo is the one way out
 * (lib/deletion.ts skips this check on purpose).
 */
export function readOnlyReason(ctx: Ctx): string | null {
  if (ctx.demo) return DEMO_REFUSAL;
  if (ctx.household.deleteAfter) {
    return `${ctx.household.name} is being deleted on ${householdDate(ctx, ctx.household.deleteAfter)}, so it's read-only until then. An admin can undo that.`;
  }
  return null;
}

/** Throws readOnlyReason as an ActionError. */
export function assertWritable(ctx: Ctx): void {
  const no = readOnlyReason(ctx);
  if (no) throw new ActionError(no);
}

// The same rules with an explicit ctx, for library functions (and scripts/verify, which has no
// request). They throw ActionError so actions can show the message.

export function assertAdmin(ctx: Ctx): void {
  assertWritable(ctx);
  if (ctx.membership.role !== "admin") throw new ActionError("Only a household admin can do that.");
}

/**
 * Managing something owned by `ownerId` (an existing bill's owner, or a type's owner for a new
 * bill): an admin, or that owner. Existing bills are judged by the bill's own owner_id, so
 * handing a type to someone else doesn't take the old owner's bills away from them.
 */
export function assertCanManage(ctx: Ctx, ownerId: number | null): void {
  assertWritable(ctx);
  if (ctx.membership.role === "admin") return;
  if (ownerId === null || ownerId !== ctx.membership.id) {
    throw new ActionError("You can only post bills and mark payments for bill types you own.");
  }
}

/** Posting a new bill of a type: an admin, or the member who owns the type now. */
export async function assertBillManager(tx: Tx, ctx: Ctx, typeId: number): Promise<void> {
  assertWritable(ctx);
  const [type] = await tx<{ ownerId: number | null }[]>`
    SELECT owner_id AS "ownerId" FROM bill_types WHERE id = ${typeId}`;
  assertCanManage(ctx, type ? type.ownerId : null);
}
