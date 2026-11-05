"use server";

import { assertAdmin, readOnlyReason, requireUserAction } from "@/lib/auth";
import { sendBulkEmail } from "@/lib/bulk";
import { ActionError } from "@/lib/errors";
import { done } from "@/lib/flash";
import { householdPath } from "@/lib/paths";

export interface BulkEmailState {
  errors: string[];
  subject?: string;
  body?: string;
}

/** useActionState: errors come back inline with the draft intact; success redirects with ?ok=. */
export async function sendBulkEmailAction(_prev: BulkEmailState, formData: FormData): Promise<BulkEmailState> {
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  let report;
  let back: string;
  try {
    const ctx = await requireUserAction();
    back = householdPath(ctx.household, "/household/email");
    const no = readOnlyReason(ctx);
    if (no) return { errors: [no], subject, body };
    assertAdmin(ctx);
    report = await sendBulkEmail(ctx, { subject, body });
  } catch (e) {
    if (e instanceof ActionError) return { errors: e.message.split("\n"), subject, body };
    throw e;
  }
  if (report.sentTo.length === 0) return { errors: ["None of the emails sent. Try again in a minute."], subject, body };
  const n = report.sentTo.length;
  done(
    back,
    `Emailed ${n} ${n === 1 ? "person" : "people"}.${report.failedTo.length ? ` Didn't reach ${report.failedTo.join(", ")}.` : ""}`,
  );
}
