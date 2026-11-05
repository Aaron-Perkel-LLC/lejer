// The operator (ARCHITECTURE.md §4 "Cross-household reads for the operator"): the addresses in
// SUPERADMIN_EMAILS may open /admin. Everyone else gets not-found, never a 403, so the page's
// existence is no more visible than any other unknown URL. The env is read on every call.
//
// An operator account is operator-only, never a household member: signing in lands on /admin,
// /new, /households and every household page send it back there, it never accepts an invite
// (lib/context.ts accept()), and inviting its address is refused (OPERATOR_INVITE_REFUSAL).

import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/context";
import { normalizeEmail } from "@/lib/login-codes";
import type { User } from "@/lib/types";

export function superadminEmails(): Set<string> {
  return new Set((process.env.SUPERADMIN_EMAILS ?? "").split(",").map((e) => normalizeEmail(e)).filter((e): e is string => !!e));
}

export function isSuperadmin(user: Pick<User, "email">): boolean {
  const email = normalizeEmail(user.email);
  return !!email && superadminEmails().has(email);
}

/** Where an operator account lives; homePath() returns it for them. */
export const ADMIN_PATH = "/admin";

/** Inviting an operator's address: plain, and nothing about lists. */
export const OPERATOR_INVITE_REFUSAL = "That address runs the site and can't join a household.";

/** The page's lock: signed out → login; signed in and not the operator → not found (a 404). */
export async function requireSuperadmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isSuperadmin(user)) notFound();
  return user;
}
