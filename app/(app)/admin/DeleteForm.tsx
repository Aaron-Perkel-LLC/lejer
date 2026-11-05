"use client";

import SubmitButton from "@/app/components/SubmitButton";
import type { FormAction } from "./types";

/**
 * The confirm-by-typing delete, the same for a household and a person: folded under one word
 * in the row's details, and open, a framed panel with the warning, the key to type and the
 * button. Inline rather than a dialog: nothing here needs the page taken away.
 */
export default function DeleteForm({
  action,
  id,
  summary,
  what,
  keyLabel,
  keyValue,
  inputId,
}: {
  action: FormAction;
  id: number;
  summary: string;
  what: React.ReactNode;
  keyLabel: string;
  keyValue: string;
  inputId: string;
}) {
  return (
    <details className="s-delete">
      <summary className="s-link">{summary}</summary>
      <form action={action} className="s-delete-panel">
        <input type="hidden" name="id" value={id} />
        <p className="s-hint">{what}</p>
        <label className="s-label" htmlFor={inputId}>
          Type {keyLabel} to confirm
        </label>
        <div className="s-delete-row">
          <input className="s-input s-input-sm s-mono" id={inputId} name="confirm" placeholder={keyValue} autoComplete="off" required />
          <SubmitButton className="s-btn s-btn-sm s-btn-danger" pendingLabel="Deleting…">
            Delete
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}
