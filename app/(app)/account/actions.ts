"use server";

import { redirect } from "next/navigation";
import { getCtxForHousehold, getSessionUser } from "@/lib/context";
import { withHousehold, withUser } from "@/lib/db";
import { done, fail } from "@/lib/flash";
import { MEMBER_CATEGORIES, type MemberCategory, USER_CATEGORIES, setMutedKinds, setUserMutedKinds } from "@/lib/unsubscribe";

const PATH = "/account";

/** Your display name, shared by every household you're in. */
export async function updateMyName(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) fail(PATH, "Enter your name (up to 80 characters).");
  await withUser(user.id, (tx) => tx`UPDATE users SET name = ${name} WHERE id = ${user.id}`);
  done(PATH, "Name updated.");
}

/**
 * Which household emails you get: the checked categories stay on, the rest are muted
 * (memberships.muted_kinds). The same switches an email's unsubscribe link flips one at a time.
 */
export async function updateMailPrefs(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCtxForHousehold(Number(formData.get("householdId")));
  if (!ctx) fail(PATH, "You're not in that household any more.");
  const on = new Set(formData.getAll("on").map(String));
  const muted = MEMBER_CATEGORIES.filter((c): c is MemberCategory => !on.has(c));
  await withHousehold(ctx, (tx) => setMutedKinds(tx, ctx.membership.id, muted));
  done(PATH, `Email settings for ${ctx.household.name} saved.`);
}

/** Mail to you rather than to a member: the operator's updates (users.muted_kinds, 0016). */
export async function updateSiteMailPrefs(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const on = new Set(formData.getAll("on").map(String));
  const muted = USER_CATEGORIES.filter((c) => !on.has(c));
  await withUser(user.id, (tx) => setUserMutedKinds(tx, user.id, muted));
  done(PATH, "Email settings saved.");
}

/**
 * Rotates your calendar token in one of your households: the old /cal.ics?k= link stops
 * working at once. Other members' links are untouched.
 */
export async function resetCalendarLink(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getCtxForHousehold(Number(formData.get("householdId")));
  if (!ctx) fail(PATH, "You're not in that household any more.");
  await withHousehold(ctx, (tx) => tx`
    UPDATE memberships SET calendar_token = DEFAULT WHERE id = ${ctx.membership.id}`);
  done(PATH, `Your calendar link for ${ctx.household.name} was reset. Re-subscribe with the new one.`);
}
