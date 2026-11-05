"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, readOnlyReason, requireUserAction } from "@/lib/auth";
import { withHousehold } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { done } from "@/lib/flash";
import { householdPath } from "@/lib/paths";
import { type SettingsForm, parseLook, parseSettings, saveLook, saveSettings, settingsFormFromData } from "@/lib/settings";

export interface SettingsState {
  errors: string[];
  values?: SettingsForm;
}

export type LookResult = { ok: true } | { ok: false; error: string };

/**
 * The Look group's own save, called the moment a theme card or dark-mode choice is picked (the
 * form has already moved <html> to it). No redirect: the form stays as it is, and the
 * revalidation re-renders the household's layout so ThemeSync and the header agree.
 */
export async function saveLookAction(theme: string, colorScheme: string): Promise<LookResult> {
  try {
    const ctx = await requireUserAction();
    const no = readOnlyReason(ctx);
    if (no) return { ok: false, error: no };
    assertAdmin(ctx);
    const look = parseLook({ theme: String(theme), colorScheme: String(colorScheme) });
    await withHousehold(ctx, (tx) => saveLook(tx, ctx, look));
    revalidatePath(householdPath(ctx.household), "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    throw e;
  }
}

/** useActionState: errors come back inline with what was typed; success redirects with ?ok=. */
export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const values = settingsFormFromData(formData);
  let message: string;
  let back: string;
  try {
    const ctx = await requireUserAction();
    back = householdPath(ctx.household, "/household/settings");
    const no = readOnlyReason(ctx);
    if (no) return { errors: [no], values };
    assertAdmin(ctx);
    const input = parseSettings(values);
    const { typesReassigned } = await withHousehold(ctx, (tx) => saveSettings(tx, ctx, input));
    // The theme and name live on <html> and in the header, rendered by the household's root
    // layout and template: drop the router's cached copies so the redirect re-renders them
    // (ThemeSync then moves <html> to the new theme without a full load).
    revalidatePath(householdPath(ctx.household), "layout");
    message =
      input.mode !== ctx.household.mode
        ? input.mode === "single_payer"
          ? `Settings saved. ${input.name} is single payer now; bills already posted keep their owner.`
          : `Settings saved. ${input.name} keeps a ledger now; each bill type shows its owner.`
        : typesReassigned
          ? `Settings saved. Every bill type now belongs to the new payer; bills already posted keep their owner.`
          : "Settings saved.";
  } catch (e) {
    if (e instanceof ActionError) return { errors: e.message.split("\n"), values };
    throw e;
  }
  done(back, message);
}
