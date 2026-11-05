"use server";

import { THEMES } from "@/lib/theme";
import { redirect } from "next/navigation";
import { requireMemberUser } from "@/lib/context";
import { withUser } from "@/lib/db";
import { utilityEmoji } from "@/lib/bills";
import { attempt, fail } from "@/lib/flash";
import { createHousehold, STARTER_UTILITIES } from "@/lib/households";
import { householdPath } from "@/lib/paths";
import type { HouseholdMode, Theme } from "@/lib/types";

const PATH = "/new";
const MODES: HouseholdMode[] = ["single_payer", "ledger"];


/**
 * The utilities step: every checked one with its emoji (optional) and processing fee. Unchecking
 * them all is fine; the overview's first step then points at Settings → Utilities.
 */
function pickedUtilities(formData: FormData) {
  const checked = new Set(formData.getAll("utilities").map(String));
  return STARTER_UTILITIES.filter((u) => checked.has(u.key)).map((u) => {
    const fee = String(formData.get(`fee_${u.key}`) ?? "").trim();
    if (fee !== "" && !(/^\d+(\.\d{1,2})?$/.test(fee) && Number(fee) < 1000)) {
      fail(PATH, `The ${u.name} processing fee must be an amount like 1.50, or 0.`);
    }
    return { name: u.name, emoji: utilityEmoji(String(formData.get(`emoji_${u.key}`) ?? "")), processingFee: fee === "" ? 0 : Number(fee) };
  });
}

/**
 * Onboarding: the user's real name, then their household and its utilities (createHousehold,
 * owner role), then the tour: the creator lands on /{slug}/welcome, whose finish and skip open
 * the overview. Invited members are never sent there; their overview offers it in a banner.
 */
export async function createHouseholdAction(formData: FormData): Promise<void> {
  const user = await requireMemberUser(); // an operator is sent to /admin and creates nothing

  const name = String(formData.get("name") ?? "").trim();
  const householdName = String(formData.get("householdName") ?? "").trim();
  const mode = String(formData.get("mode")) as HouseholdMode;
  const theme = String(formData.get("theme")) as Theme;
  const timezone = String(formData.get("timezone") ?? "");

  if (!name || name.length > 80) fail(PATH, "Enter your name (up to 80 characters).");
  if (!householdName || householdName.length > 80) fail(PATH, "Name your household (up to 80 characters).");
  if (!MODES.includes(mode)) fail(PATH, "Pick how your household pays its bills.");
  if (!THEMES.includes(theme)) fail(PATH, "Pick a look.");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    fail(PATH, "Pick a time zone from the list.");
  }

  const utilities = await attempt(PATH, async () => pickedUtilities(formData));

  await withUser(user.id, (tx) => tx`UPDATE users SET name = ${name} WHERE id = ${user.id}`);
  const household = await createHousehold({ userId: user.id, email: user.email, name: householdName, mode, theme, timezone, utilities });
  redirect(householdPath(household, "/welcome"));
}
