// The launch gate (ARCHITECTURE.md §5, "Launch gate"): LAUNCH_GATE=on in Production until
// launch. While on, "/" is a coming-soon page, the other public pages redirect there
// (proxy.ts), every response says noindex, and sign-in and invites are limited to
// SIGNIN_ALLOWLIST. Off is any other value or unset: one env change, no code. Every function
// reads the env when called, never at module load. Plain module: proxy.ts imports it.

import { BRAND } from "@/lib/brand";
import { normalizeEmail } from "@/lib/login-codes";
import { DEMO_SLUG, householdSlugOf } from "@/lib/paths";

export const launchGated = (): boolean => process.env.LAUNCH_GATE === "on";

/** The addresses that may sign in while gated (comma-separated, any case). Empty: nobody. */
function allowlist(): Set<string> {
  return new Set((process.env.SIGNIN_ALLOWLIST ?? "").split(",").map((e) => normalizeEmail(e)).filter((e): e is string => !!e));
}

/** Whether a (normalized) address may request a code or be invited right now. */
export function signinAllowed(email: string): boolean {
  return !launchGated() || allowlist().has(email);
}

/** The refusal people see: neutral, nothing about lists. */
export const GATE_REFUSAL = `${BRAND.name} isn't open yet.`;

/** Public pages that send visitors to "/" while gated: the site's other pages and the demo. */
export function gatedRedirect(pathname: string): boolean {
  return pathname === "/about" || pathname === "/how-it-works" || householdSlugOf(pathname) === DEMO_SLUG;
}

/** Launch day (CLAUDE.md "Open TODOs"): the coming-soon page names it until it has passed. */
export const LAUNCH_DATE = "2026-10-23";

/**
 * "Friday, October 23", or null once launch day is over in US Eastern (the operator's day), so
 * a launch that slips never leaves a stale date on the page.
 */
export function launchDateLabel(now: Date = new Date()): string | null {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (today > LAUNCH_DATE) return null;
  const [y, m, d] = LAUNCH_DATE.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** The coming-soon page's heading and meta description: the date while it holds, else just "almost ready". */
export function launchHeading(now: Date = new Date()): string {
  const label = launchDateLabel(now);
  return label ? `${BRAND.name} opens ${label}.` : `${BRAND.name} is almost ready.`;
}
