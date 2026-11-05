"use client";

import { useActionState, useEffect, useRef } from "react";
import Dialog, { DialogBody, DialogFooter, type DialogHandle } from "@/app/components/Dialog";
import { type AddBillState, addBill } from "@/app/(household)/[household]/bills/actions";
import BillFields, { type TypeOption } from "@/app/(household)/[household]/bills/BillFields";
import { NOTICE_DELAY_MINUTES } from "@/lib/notice-delay";

/**
 * "+ Add bill": the page's one primary action, in the header slot of the overview and the bills
 * page, opening the shared Dialog (every "add" in the app is a dialog). Asks for the statement
 * date only when the household's ask_bill_date is on (otherwise the server stamps today in the
 * household's timezone); the PDF is optional. `types` is already filtered to what the viewer may
 * post (all for admins, owned for members). `back` is where a posted bill lands: the page it was
 * posted from. On a phone it's a full-screen sheet with Cancel / Post in a bar at the top (it has
 * the most fields, and the keyboard takes half the screen).
 */
export default function AddBillDialog({
  types,
  splitterCount,
  askBillDate,
  back,
}: {
  types: TypeOption[];
  splitterCount: number;
  askBillDate: boolean;
  back: "overview" | "bills";
}) {
  const [state, formAction, pending] = useActionState<AddBillState, FormData>(addBill, { errors: [] });
  const dialog = useRef<DialogHandle>(null);
  const wasPending = useRef(false);
  // A post that went through redirects with ?ok=; close so the flash is what shows.
  useEffect(() => {
    if (wasPending.current && !pending && state.errors.length === 0) dialog.current?.close();
    wasPending.current = pending;
  }, [pending, state]);
  const formId = `add-bill-${back}`;

  return (
    <Dialog
      wide
      sheet
      handle={dialog}
      title="Add a bill"
      description={
        <span className="block max-w-[60ch]">
          Everyone who splits it gets an email {NOTICE_DELAY_MINUTES} minutes after you post, so there&apos;s time to fix a mistake first.
        </span>
      }
      trigger={(open) => (
        <button type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={open}>
          + Add bill
        </button>
      )}
    >
      {(close) => (
        <>
          <DialogBody>
            {state.errors.length > 0 && (
              <div className="flash flash-err" role="alert">
                <ul className={state.errors.length > 1 ? "list-disc pl-5" : ""}>
                  {state.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <form id={formId} action={formAction}>
              <input type="hidden" name="back" value={back} />
              <BillFields idPrefix={formId} types={types} shares={splitterCount} askBillDate={askBillDate} pdf={{ mode: "add" }} />
            </form>
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={pending} aria-busy={pending}>
              {pending ? "Posting…" : "Post bill"}
            </button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
