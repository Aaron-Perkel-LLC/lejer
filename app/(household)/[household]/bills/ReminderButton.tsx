"use client";

import ConfirmButton from "@/app/components/ConfirmButton";
import { sendReminder } from "@/app/(household)/[household]/bills/actions";

export default function ReminderButton({ billId, typeName }: { billId: number; typeName: string }) {
  return (
    <form action={sendReminder} className="inline">
      <input type="hidden" name="billId" value={billId} />
      <ConfirmButton
        // A word, not an icon: row actions read the same on every screen (Remind, then Edit).
        className="btn btn-sm"
        buttonProps={{ "aria-label": `Remind everyone who owes on ${typeName}` }}
        title={`Remind everyone who owes on ${typeName}?`}
        body="Each person who hasn't paid gets one email now. It counts toward the household's daily email limit."
        confirmLabel="Send reminder"
        pendingLabel="Sending…"
      >
        Remind
      </ConfirmButton>
    </form>
  );
}
