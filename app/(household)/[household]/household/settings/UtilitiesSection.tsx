"use client";

import { useState } from "react";
import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import DialogConfirm from "@/app/components/DialogConfirm";
import { removeBillTypeAction, saveBillTypeAction } from "@/app/(household)/[household]/household/actions";

export interface BillTypeRow {
  id: number;
  name: string;
  emoji: string | null;
  processingFee: number;
  ownerId: number | null;
  ownerName: string | null;
  inTrends: boolean;
}

/**
 * Settings' Utilities group: the household's bill types (name, optional emoji, fee) with their owner, who
 * fronts the bill. In single-payer mode the owner column is hidden: every type belongs to the
 * payer, and the server enforces that. It sits first on Settings (#utilities, where the Overview's
first step and Bills point), outside the settings form, because
 * each utility saves on its own: "+ Add utility" on the group's rule and Edit on each row open
 * the shared Dialog, and removing one confirms inside its Edit dialog. A refused save comes back
 * as the page's flash. Members read the table without the controls. While Trends is on, each
 * utility says whether it's charted there ("Show on Trends" in its dialog; off for flat bills like
 * internet or insurance), and one left off reads "Not on Trends" under its name.
 */
export default function UtilitiesSection({
  types,
  people,
  ledger,
  trends,
  canEdit,
}: {
  types: BillTypeRow[];
  people: { id: number; name: string }[];
  ledger: boolean;
  trends: boolean;
  canEdit: boolean;
}) {
  const cols = 2 + (ledger ? 1 : 0) + (canEdit ? 1 : 0);

  return (
    <section id="utilities" aria-labelledby="group-Utilities" className="scroll-mt-6">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="group-Utilities" className="eyebrow">Utilities</h2>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        {canEdit && (
          <BillTypeDialog
            people={people}
            ledger={ledger}
            trends={trends}
            trigger={(open) => (
              <button type="button" className="btn btn-sm" aria-haspopup="dialog" onClick={open}>
                + Add utility
              </button>
            )}
          />
        )}
      </div>
      <div className="panel overflow-x-auto">
        <table className="data-table table-stack table-stack-types">
          <thead>
            <tr>
              <th>Utility</th>
              {ledger && <th>Owner (pays the provider)</th>}
              <th className="num">Processing fee</th>
              {canEdit && (
                <th className="num">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id}>
                <td className="cell-type font-medium">
                  {t.emoji ? `${t.emoji} ` : ""}{t.name}
                  {trends && !t.inTrends && <span className="block text-xs font-normal text-ink-muted">Not on Trends</span>}
                </td>
                {ledger && <td className="cell-owner text-ink-muted">{t.ownerName ?? "Nobody (split by everyone)"}</td>}
                <td className="num figure cell-fee text-ink-muted">
                  ${t.processingFee.toFixed(2)}
                  <span className="sm:hidden"> fee</span>
                </td>
                {canEdit && (
                  <td className="num cell-actions">
                    <div className="flex justify-end gap-1.5">
                      <BillTypeDialog
                        type={t}
                        people={people}
                        ledger={ledger}
                        trends={trends}
                        trigger={(open) => (
                          <button type="button" className="btn btn-sm" aria-haspopup="dialog" aria-label={`Edit ${t.name}`} onClick={open}>
                            Edit
                          </button>
                        )}
                      />

                    </div>
                  </td>
                )}
              </tr>
            ))}
            {types.length === 0 && (
              <tr>
                <td colSpan={cols} className="text-center text-ink-muted">No utilities yet. Add the bills your household splits: gas, electric, internet…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Add (no `type`) or edit one utility, in the shared Dialog; an existing one can be removed here. */
function BillTypeDialog({
  type,
  people,
  ledger,
  trends,
  trigger,
}: {
  type?: BillTypeRow;
  people: { id: number; name: string }[];
  ledger: boolean;
  trends: boolean;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const id = (name: string) => `bt-${type?.id ?? "new"}-${name}`;
  const formId = id("form");
  const [confirming, setConfirming] = useState(false);
  return (
    <Dialog
      title={type ? `Edit ${type.name}` : "Add a utility"}
      trigger={(open) =>
        trigger(() => {
          setConfirming(false);
          open();
        })
      }
    >
      {(close) => (
        <>
        <form id={formId} action={saveBillTypeAction} onSubmit={() => setTimeout(close)}>
          {type && <input type="hidden" name="typeId" value={type.id} />}
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <div>
                <label className="field-label" htmlFor={id("name")}>Name</label>
                <input className="field-input" id={id("name")} name="name" placeholder="Water" defaultValue={type?.name} maxLength={40} required autoFocus />
              </div>
              <div>
                <label className="field-label" htmlFor={id("emoji")}>Emoji</label>
                {/* Optional, and empty until typed: the hint is placeholder text, its ⚡ in text
                    presentation (U+FE0E) so it takes the muted placeholder color where the
                    platform has a text glyph, rather than reading as a value. */}
                <input className="field-input" id={id("emoji")} name="emoji" placeholder={"Optional, e.g. \u26A1\uFE0E"} defaultValue={type?.emoji ?? ""} />
              </div>
            </div>
            <div className={`mt-4 grid gap-4 ${ledger ? "sm:grid-cols-2" : ""}`}>
              {ledger && (
                <div>
                  <label className="field-label" htmlFor={id("owner")}>Owner</label>
                  <select className="field-input" id={id("owner")} name="ownerId" defaultValue={type?.ownerId ?? ""}>
                    <option value="">Nobody (split by everyone)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">They pay the provider; everyone else pays them back. Bills already posted keep their owner.</p>
                </div>
              )}
              <div>
                <label className="field-label" htmlFor={id("fee")}>Processing fee</label>
                <input
                  className="field-input figure"
                  id={id("fee")}
                  name="processingFee"
                  inputMode="decimal"
                  defaultValue={type ? type.processingFee.toFixed(2) : "0.00"}
                />
                <p className="field-hint">Added to every bill of this type before it&apos;s split.</p>
              </div>
            </div>
            {trends && (
              <>
                <input type="hidden" name="trendsField" value="1" />
                <label className="mt-4 flex items-start gap-3">
                  <input type="checkbox" name="inTrends" defaultChecked={type?.inTrends ?? true} className="mt-1 size-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">Show on Trends</span>
                    <span className="block max-w-[60ch] text-sm text-ink-muted">
                      Untick it for a flat bill like internet, a phone plan or insurance: it leaves the chart, the totals and the CSV. Its bills stay everywhere else.
                    </span>
                  </span>
                </label>
              </>
            )}
          </DialogBody>
        </form>
        {type && confirming ? (
          <DialogConfirm
            action={removeBillTypeAction}
            fields={{ typeId: type.id }}
            question={`Remove ${type.name}?`}
            body="It disappears from the add-bill list. A utility with bills on record can't be removed, so nothing posted is lost."
            confirmLabel="Remove"
            pendingLabel="Removing…"
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <DialogFooter
            start={
              type && (
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  Remove
                </button>
              )
            }
          >
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" form={formId} className="btn btn-primary">
              {type ? "Save" : "Add utility"}
            </button>
          </DialogFooter>
        )}
        </>
      )}
    </Dialog>
  );
}
