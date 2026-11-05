"use server";

import { redirect } from "next/navigation";
import { UNSUBSCRIBE_PATH, applyUnsubscribe, readUnsubscribe } from "@/lib/unsubscribe";

/** The page's button: turn that category off, then show the page again as "done". */
export async function unsubscribeAction(formData: FormData): Promise<void> {
  const k = String(formData.get("k") ?? "");
  const scope = await readUnsubscribe(k);
  if (!scope) redirect(UNSUBSCRIBE_PATH);
  const found = await applyUnsubscribe(scope);
  redirect(`${UNSUBSCRIBE_PATH}?${new URLSearchParams({ k, done: found ? "1" : "0" })}`);
}
