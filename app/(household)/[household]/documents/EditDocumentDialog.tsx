"use client";

import { useState } from "react";
import { removeDocumentAction, updateDocumentAction } from "@/app/(household)/[household]/documents/actions";
import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import DialogConfirm from "@/app/components/DialogConfirm";

interface CategoryOption {
  key: string;
  label: string;
  emoji: string;
}

export interface DocumentSummary {
  id: number;
  title: string;
  category: string;
}

/**
 * Admin-only: "Edit" on a document's row opens the shared Dialog (title and category; the file
 * itself can't be replaced), and Remove sits on its footer's left, confirming in place.
 */
export default function EditDocumentDialog({
  document,
  categories,
}: {
  document: DocumentSummary;
  categories: CategoryOption[];
}) {
  const formId = `doc-${document.id}`;
  const [confirming, setConfirming] = useState(false);
  return (
    <Dialog
      title={`Edit ${document.title}`}
      description="To replace the file itself, add a new document and remove this one."
      trigger={(open) => (
        <button
          type="button"
          className="btn btn-sm"
          aria-haspopup="dialog"
          aria-label={`Edit ${document.title}`}
          onClick={() => {
            setConfirming(false);
            open();
          }}
        >
          Edit
        </button>
      )}
    >
      {(close) => (
        <>
          <DialogBody>
            <form id={formId} action={updateDocumentAction} onSubmit={() => setTimeout(close)}>
              <input type="hidden" name="documentId" value={document.id} />
              <div>
                <label className="field-label" htmlFor={`${formId}-title`}>
                  Title
                </label>
                <input className="field-input" id={`${formId}-title`} name="title" defaultValue={document.title} maxLength={150} required autoFocus />
              </div>
              <div className="mt-4">
                <label className="field-label" htmlFor={`${formId}-category`}>
                  Category
                </label>
                <select className="field-input" id={`${formId}-category`} name="category" defaultValue={document.category} required>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </DialogBody>
          {confirming ? (
            <DialogConfirm
              action={removeDocumentAction}
              fields={{ documentId: document.id }}
              question={`Remove ${document.title}?`}
              body="The file is deleted for everyone in the household. This can't be undone."
              confirmLabel="Remove"
              pendingLabel="Removing…"
              onKeep={() => setConfirming(false)}
            />
          ) : (
            <DialogFooter
              start={
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  Remove
                </button>
              }
            >
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" form={formId} className="btn btn-primary">
                Save
              </button>
            </DialogFooter>
          )}
        </>
      )}
    </Dialog>
  );
}
