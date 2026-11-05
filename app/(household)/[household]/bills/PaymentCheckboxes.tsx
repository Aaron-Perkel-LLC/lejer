"use client";

import { useState, useTransition } from "react";
import { setPaidAction } from "@/app/(household)/[household]/bills/actions";

export interface OwnerCheck {
  personId: number;
  name: string;
  paid: boolean;
  /** The viewer is the owner: the box reads "You paid the provider". */
  isYou: boolean;
}

/**
 * One checkbox per debtor on a bill (its fixed debtor set), and, with the payer's own check-off
 * on, one for the owner first ("You paid the provider"). Each toggle saves that one row and
 * says so in a polite live line ("Saved: Sam paid back"); unchecking is the undo. On failure
 * the box snaps back and the reason shows inline. Rows are 44px tall on touch screens.
 */
export default function PaymentCheckboxes({
  billId,
  billLabel,
  debts,
  owner = null,
  canEdit,
}: {
  billId: number;
  /** "Water, Sep 22": names the bill for screen readers, since each box is labelled by a name. */
  billLabel: string;
  debts: { personId: number; name: string; paid: boolean }[];
  /** The owner's own tick (Bill.ownerPaid !== null); null when the setting is off. */
  owner?: OwnerCheck | null;
  canEdit: boolean;
}) {
  const rows = [
    ...(owner ? [{ personId: owner.personId, name: owner.isYou ? "You" : owner.name, paid: owner.paid, provider: true }] : []),
    ...debts.map((d) => ({ ...d, provider: false })),
  ];
  const [paid, setPaid] = useState(() => new Set(rows.filter((d) => d.paid).map((d) => d.personId)));
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(personId: number, checked: boolean) {
    const previous = paid;
    const next = new Set(paid);
    if (checked) next.add(personId);
    else next.delete(personId);
    setPaid(next);
    setStatus(null);
    const row = rows.find((d) => d.personId === personId);
    const name = row?.name ?? "";
    startTransition(async () => {
      const result = await setPaidAction(billId, personId, checked);
      if (!result.ok) {
        setPaid(previous);
        setStatus({ ok: false, text: result.error });
      } else if (row?.provider) {
        setStatus({ ok: true, text: checked ? "Saved: the provider is paid." : "Saved: the provider isn't paid yet." });
      } else {
        setStatus({ ok: true, text: checked ? `Saved: ${name} paid back.` : `Saved: ${name} still owes.` });
      }
    });
  }

  return (
    <div>
      <div className={`flex flex-wrap gap-x-5 ${pending ? "opacity-60" : ""}`}>
        {rows.map((d) => (
          <label key={d.personId} className={`inline-flex min-h-8 items-center gap-2 text-sm pointer-coarse:min-h-11 ${canEdit ? "cursor-pointer" : ""}`}>
            <input
              type="checkbox"
              className="size-4 pointer-coarse:size-5"
              checked={paid.has(d.personId)}
              disabled={!canEdit || pending}
              aria-label={d.provider ? `${d.name} paid the provider for ${billLabel}` : `${d.name} paid back ${billLabel}`}
              onChange={(e) => toggle(d.personId, e.target.checked)}
            />
            <span>{d.provider ? `${d.name} paid the provider` : d.name}</span>
          </label>
        ))}
      </div>
      <p className={`text-xs ${status?.ok === false ? "text-unpaid" : "text-ink-muted"}`} role={status?.ok === false ? "alert" : "status"} aria-live="polite">
        {status?.text}
      </p>
    </div>
  );
}
