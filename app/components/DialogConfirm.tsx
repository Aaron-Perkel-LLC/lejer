"use client";

import SubmitButton from "@/app/components/SubmitButton";

/**
 * The question a form dialog asks before destroying something, in place of its footer (DESIGN.md
 * "Dialogs": a dialog never opens on top of another). The dialog shows its usual footer with the
 * destructive button on the left; pressing it swaps that footer for this one: the question in
 * bold, what happens, "Keep it" (focused, so Enter never destroys by accident) and the
 * destructive primary, which posts `action` with the hidden `fields`.
 */
export default function DialogConfirm({
  action,
  fields,
  question,
  body,
  confirmLabel,
  pendingLabel,
  onKeep,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string | number>;
  question: string;
  body: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onKeep: () => void;
}) {
  return (
    <form action={action} className="border-t border-line-soft px-5 py-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="mb-3 max-w-[60ch] text-left text-sm" role="alert">
        <strong>{question}</strong> {body}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" autoFocus onClick={onKeep}>
          Keep it
        </button>
        <SubmitButton className="btn btn-primary" pendingLabel={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
