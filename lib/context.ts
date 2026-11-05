import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { withHousehold, withUser } from "@/lib/db";
import { demoCtx } from "@/lib/demo";
import { type MyHousehold, type SessionRows, getUserByEmail, loadMyHouseholds, markJoined, myHousehold } from "@/lib/households";
import { DEMO_SLUG, HOUSEHOLD_HEADER, householdPath } from "@/lib/paths";
import { HOUSEHOLD_COOKIE, devBypass, getSession } from "@/lib/session";
import { ADMIN_PATH, isSuperadmin } from "@/lib/superadmin";
import type { Household, Membership, User } from "@/lib/types";

export interface Ctx {
  user: User;
  membership: Membership;
  household: Household;
  demo: boolean;
}

/**
 * The session's rows (the user plus every membership and household of theirs), loaded once
 * per request in one transaction and one statement (lib/households.ts loadMyHouseholds).
 * Everything below reads from it: the URL's household, the switcher, /households, homePath.
 * Null when signed out. The dev bypass first resolves its email to an id (dev only).
 */
const loadSession = cache(async (): Promise<SessionRows | null> => {
  await connection(); // per-request, never prerendered
  const dev = devBypass();
  let uid: number;
  if (dev) {
    const user = await withUser(null, (tx) => getUserByEmail(tx, dev.email));
    if (!user) return null;
    uid = user.id;
  } else {
    const session = await getSession();
    if (!session) return null;
    uid = session.uid;
  }
  return withUser(uid, (tx) => loadMyHouseholds(tx, uid));
});

/**
 * The request as { user, membership, household }, once per request, or null.
 * The household is the one the URL names (proxy.ts passes its slug in HOUSEHOLD_HEADER;
 * lib/paths.ts), checked against the viewer's memberships every time: no membership, no ctx.
 * /demo is the in-memory demo household for anyone. Pages outside a household (/account,
 * /households, /new, /login) get null; getSessionUser serves them.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const slug = (await headers()).get(HOUSEHOLD_HEADER);
  if (!slug) return null;
  if (slug === DEMO_SLUG) return demoCtx();
  const session = await loadSession();
  if (!session) return null;
  return accept(session.user, session.rows.find((r) => r.household.slug === slug) ?? null);
});

/**
 * The same, for a household named by id rather than by the URL: /files and the document
 * upload handshake, whose keys carry h/{id}/, and the calendar reset on /account.
 */
export async function getCtxForHousehold(householdId: number): Promise<Ctx | null> {
  const session = await loadSession();
  if (!session) return null;
  return accept(session.user, session.rows.find((r) => r.household.id === householdId) ?? null);
}

/**
 * Opening a household you were invited to accepts it (signing in does too). An operator account
 * (lib/superadmin.ts) never gets a ctx, so it never reads a household or accepts an invite.
 */
async function accept(user: User, found: SessionRows["rows"][number] | null): Promise<Ctx | null> {
  if (!found || isSuperadmin(user)) return null;
  if (!found.membership.joinedAt) {
    await withHousehold({ household: found.household, user }, (tx) => markJoined(tx, found.membership.id));
    found.membership = { ...found.membership, joinedAt: new Date() }; // the cached row, for the rest of the request
  }
  return { user, membership: found.membership, household: found.household, demo: false };
}

/** The signed-in user (dev bypass or session), household or not. Never the demo visitor. */
export const getSessionUser = cache(async (): Promise<User | null> => (await loadSession())?.user ?? null);

/** Every household the signed-in user is in (the switcher, /households); [] signed out. */
export async function getMyHouseholds(): Promise<MyHousehold[]> {
  return (await loadSession())?.rows.map(myHousehold) ?? [];
}

/**
 * The household "home" means for someone signed in: the one they opened last (the dev bypass's,
 * under it), else their first, joined before pending; null with none. Reads the request's
 * session when it is this user's (always, except right after a code was verified in a request
 * that had no session yet), else looks the user up.
 */
export async function homeHousehold(user: User): Promise<{ name: string; href: string } | null> {
  if (isSuperadmin(user)) return null; // an operator has no household; homePath sends them to /admin
  const session = await loadSession();
  const mine = session?.user.id === user.id
    ? session.rows.map(myHousehold)
    : ((await withUser(user.id, (tx) => loadMyHouseholds(tx, user.id)))?.rows.map(myHousehold) ?? []);
  if (mine.length === 0) return null;
  const last = devBypass()?.slug ?? (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  const first = [...mine].sort((a, b) => Number(!a.joinedAt) - Number(!b.joinedAt) || a.id - b.id)[0];
  const home = mine.find((h) => h.slug === last) ?? first;
  return { name: home.name, href: householdPath(home) };
}

/** Where "Sign in" takes someone already signed in: their home household, else onboarding; an operator, /admin. */
export async function homePath(user: User): Promise<string> {
  if (isSuperadmin(user)) return ADMIN_PATH;
  return (await homeHousehold(user))?.href ?? "/new";
}

/** The pages a signed-in person who isn't an operator uses (/new, /households): operators go to /admin. */
export async function requireMemberUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isSuperadmin(user)) redirect(ADMIN_PATH);
  return user;
}
