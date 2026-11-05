import ConfirmButton from "@/app/components/ConfirmButton";
import {
  approveDeletionAction,
  cancelDeletionAction,
  undoDeletionAction,
} from "@/app/(household)/[household]/household/actions";
import { householdDate } from "@/lib/auth";
import type { Ctx } from "@/lib/context";
import { withHousehold } from "@/lib/db";
import { GRACE_DAYS, getDeletionState } from "@/lib/deletion";
import { householdPath } from "@/lib/paths";

// The strip under the header while a household is on its way out (lib/deletion.ts), on every page
// of it: during a vote, who asked, how many have approved, and Approve / Cancel for each joined
// member; once marked, the day it goes, that it's read-only, and Undo for admins. Both point at
// the CSV of bills and payments. Reads the state only when the household row says there is one,
// so an ordinary page costs nothing extra.
export default async function DeletionBanner({ ctx }: { ctx: Ctx }) {
  const h = ctx.household;
  if (ctx.demo || (!h.deletionRequestedAt && !h.deleteAfter)) return null;
  const state = await withHousehold(ctx, (tx) => getDeletionState(tx));
  const csv = (
    <a className="underline decoration-line underline-offset-2 hover:text-ink" href={householdPath(h, "/household/export")}>
      Download bills and payments (CSV)
    </a>
  );

  if (state.deleteAfter) {
    const on = householdDate(ctx, state.deleteAfter);
    return (
      <Strip>
        <p>
          <strong>{h.name} will be deleted on {on}.</strong> Everything is read-only until then. {csv}
        </p>
        {ctx.membership.role === "admin" && (
          <form action={undoDeletionAction}>
            <ConfirmButton
              className="btn btn-sm"
              title={`Keep ${h.name}?`}
              body={<p>It won&apos;t be deleted, and everyone can post and pay bills again. Everyone who has joined is emailed.</p>}
              confirmLabel="Undo deletion"
              pendingLabel="Undoing…"
            >
              Undo deletion
            </ConfirmButton>
          </form>
        )}
      </Strip>
    );
  }

  const request = state.request;
  if (!request) return null; // a request that has lapsed; the next tick clears it
  const approved = request.voters.filter((v) => v.approved);
  const waiting = request.voters.filter((v) => !v.approved).map((v) => (v.id === ctx.membership.id ? "you" : v.name));
  const mine = request.voters.find((v) => v.id === ctx.membership.id);
  return (
    <Strip>
      <p>
        <strong>
          {request.requestedBy ?? "An admin"} asked to delete {h.name}.
        </strong>{" "}
        {approved.length} of {request.voters.length} approved
        {waiting.length > 0 && <> (waiting on {waiting.join(", ")})</>}. It lapses on {householdDate(ctx, request.expiresAt)}. {csv}
      </p>
      {mine && (
        <div className="flex flex-wrap gap-2">
          {!mine.approved && (
            <form action={approveDeletionAction}>
              <ConfirmButton
                className="btn btn-sm"
                title={`Approve deleting ${h.name}?`}
                body={
                  <p>
                    {waiting.length === 1
                      ? `You're the last approval. ${h.name} turns read-only, and it's deleted for good after ${GRACE_DAYS} days unless an admin undoes it.`
                      : `It's deleted only once everyone has approved, then after ${GRACE_DAYS} more days unless an admin undoes it.`}
                  </p>
                }
                confirmLabel="Approve"
                pendingLabel="Approving…"
              >
                Approve
              </ConfirmButton>
            </form>
          )}
          <form action={cancelDeletionAction}>
            <ConfirmButton
              className="btn btn-sm"
              title="Cancel the request?"
              body={<p>{h.name} stays as it is, and everyone who has joined is emailed that you cancelled it.</p>}
              confirmLabel="Cancel request"
              pendingLabel="Cancelling…"
            >
              Cancel request
            </ConfirmButton>
          </form>
        </div>
      )}
    </Strip>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="border-b border-line-soft bg-accent-soft">
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-5">
        {children}
      </div>
    </div>
  );
}
