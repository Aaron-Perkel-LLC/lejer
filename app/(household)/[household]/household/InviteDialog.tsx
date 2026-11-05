"use client";

import Dialog, { DialogBody, DialogFooter } from "@/app/components/Dialog";
import SubmitButton from "@/app/components/SubmitButton";
import { inviteMember } from "@/app/(household)/[household]/household/actions";

/**
 * "+ Invite": the Members page's one primary action, in the header slot, opening the shared
 * Dialog (every "add" in the app is a dialog). The invite email comes from the brand's login
 * address; signing in with that address joins the household. The outcome is the page's flash.
 */
export default function InviteDialog({ householdName, brand }: { householdName: string; brand: string }) {
  return (
    <Dialog
      wide
      title="Invite a roommate"
      description={
        <span className="block max-w-[60ch]">
          They&apos;ll get an email from {brand}. Signing in with that address joins {householdName}.
        </span>
      }
      trigger={(open) => (
        <button type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={open}>
          + Invite
        </button>
      )}
    >
      {(close) => (
        <form action={inviteMember} onSubmit={() => setTimeout(close)}>
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="invite-name">Name</label>
                <input className="field-input" id="invite-name" name="name" maxLength={80} required autoFocus />
              </div>
              <div>
                <label className="field-label" htmlFor="invite-email">Email</label>
                <input className="field-input" id="invite-email" name="email" type="email" required />
              </div>
              <div>
                <label className="field-label" htmlFor="invite-role">Role</label>
                <select className="field-input" id="invite-role" name="role" defaultValue="member" aria-describedby="invite-role-hint">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="field-hint" id="invite-role-hint">
                  Members see everything and manage bills they own. Admins manage the whole household.
                </span>
              </div>
              <label className="flex items-start gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="splitsBills" defaultChecked className="mt-1" />
                <span>
                  Splits bills
                  <span className="field-hint">Uncheck for someone who only needs to see the ledger.</span>
                </span>
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Inviting…">
              Send invite
            </SubmitButton>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
