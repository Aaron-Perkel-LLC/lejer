"use client";

import { useState } from "react";
import ConfirmButton from "@/app/components/ConfirmButton";
import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import SubmitButton from "@/app/components/SubmitButton";
import { deleteAloneAction, leaveAction, requestDeletionAction } from "@/app/(household)/[household]/household/actions";

// The end of Settings, for everyone: leaving (anyone but the last joined admin) and deleting
// (admins; lib/deletion.ts). The only joined member deletes by typing the household's name; anyone else
// asks everyone to approve. Both confirm first, and both point at the CSV of bills and payments.

const money = (n: number) => `$${n.toFixed(2)}`;

export default function LeaveOrDelete({
  householdName,
  exportHref,
  isAdmin,
  lastAdmin,
  alone,
  joinedCount,
  requestOpen,
  balance,
  graceDays,
  requestDays,
}: {
  householdName: string;
  exportHref: string;
  isAdmin: boolean;
  /** The viewer is the household's last joined admin: they can't leave. */
  lastAdmin: boolean;
  /** The viewer is the only joined member: typing the name deletes it. */
  alone: boolean;
  joinedCount: number;
  /** A deletion request is already open (the banner carries it). */
  requestOpen: boolean;
  /** What leaving would wipe: what the viewer owes, and what's owed to them. */
  balance: { owe: number; owed: number };
  graceDays: number;
  requestDays: number;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === householdName.trim();

  return (
    <section aria-labelledby="group-Leave">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="group-Leave" className="eyebrow">
          Leave or delete
        </h2>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="panel space-y-4 p-5">
        <p className="max-w-[60ch] text-sm text-ink-muted">
          Before either, you can{" "}
          <a className="underline decoration-line underline-offset-2 hover:text-ink" href={exportHref}>
            download every bill and payment as a CSV
          </a>
          .{lastAdmin && " You're the last admin here, so you can't leave: make someone else an admin first, or delete the household."}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {!lastAdmin && (
            <form action={leaveAction}>
              <ConfirmButton
                title={`Leave ${householdName}?`}
                body={
                  <>
                    <p>You won&apos;t see {householdName} anymore. An admin can invite you back.</p>
                    {balance.owe > 0 && (
                      <p className="mt-2">
                        You still owe <span className="figure">{money(balance.owe)}</span> here. Leaving takes those shares off the ledger, so settle
                        up first if you mean to.
                      </p>
                    )}
                    {balance.owed > 0 && (
                      <p className="mt-2">
                        <span className="figure">{money(balance.owed)}</span> is still owed to you. Those bills stay on record, owed to a
                        &ldquo;former member&rdquo;.
                      </p>
                    )}
                  </>
                }
                confirmLabel="Leave household"
                pendingLabel="Leaving…"
              >
                Leave household
              </ConfirmButton>
            </form>
          )}

          {isAdmin && alone && (
            <Dialog
              title={`Delete ${householdName}?`}
              description={
                <>
                  It turns read-only now and is deleted for good after {graceDays} days, with every bill, payment and file in it. You can undo
                  it until then.
                </>
              }
              trigger={(open) => (
                <button type="button" className="btn" aria-haspopup="dialog" onClick={open}>
                  Delete household
                </button>
              )}
            >
              {(close) => (
                <form action={deleteAloneAction}>
                  <DialogBody>
                    <label className="field-label" htmlFor="confirm-name">
                      Type <span className="font-semibold text-ink">{householdName}</span> to confirm
                    </label>
                    <input
                      className="field-input"
                      id="confirm-name"
                      name="confirmName"
                      autoComplete="off"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                    />
                  </DialogBody>
                  <DialogFooter>
                    <button type="button" className="btn" onClick={close}>
                      Cancel
                    </button>
                    {matches ? (
                      <SubmitButton className="btn btn-primary" pendingLabel="Deleting…">
                        Delete household
                      </SubmitButton>
                    ) : (
                      <button type="button" className="btn btn-primary" disabled>
                        Delete household
                      </button>
                    )}
                  </DialogFooter>
                </form>
              )}
            </Dialog>
          )}

          {isAdmin && !alone && !requestOpen && (
            <form action={requestDeletionAction}>
              <ConfirmButton
                title={`Ask everyone to delete ${householdName}?`}
                body={
                  <>
                    <p>
                      All {joinedCount} people who have joined are emailed, and it&apos;s deleted only if every one of them approves within{" "}
                      {requestDays} days. Anyone can cancel the request.
                    </p>
                    <p className="mt-2">
                      Once everyone approves, it turns read-only for {graceDays} days, when any admin can still undo it, and then every bill,
                      payment and file in it is deleted.
                    </p>
                  </>
                }
                confirmLabel="Ask everyone"
                pendingLabel="Asking…"
              >
                Delete household…
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
