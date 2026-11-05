import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import DueChip from "@/app/components/DueChip";
import Flash from "@/app/components/Flash";
import Pagination from "@/app/components/Pagination";
import StatusTag from "@/app/components/StatusTag";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import AddBillDialog from "@/app/(household)/[household]/bills/AddBillDialog";
import EditBillDialog from "@/app/(household)/[household]/bills/EditBillDialog";
import PaymentCheckboxes from "@/app/(household)/[household]/bills/PaymentCheckboxes";
import ReminderButton from "@/app/(household)/[household]/bills/ReminderButton";
import { readOnlyReason, requireUser } from "@/lib/auth";
import { fileHref } from "@/lib/files";
import { loadBills } from "@/lib/views";
import { householdPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Bills" };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Everyone in the household can see this page. Admins manage every bill; a member manages
// (posts, marks payments, reminds, and edits or deletes until someone has paid) only bills they
// own.
export default async function BillsPage({ searchParams }: PageProps<"/[household]/bills">) {
  const ctx = await requireUser();
  const sp = await searchParams;
  const requested = Math.max(1, Number(sp.page) || 1);
  const data = await loadBills(ctx, requested);
  if (data.page !== requested && data.totalBills > 0) redirect(`${householdPath(ctx.household, "/bills")}?page=${data.page}`);

  const isAdmin = ctx.membership.role === "admin";
  // Nothing is managed while the household is read-only (marked for deletion; the demo still shows its controls and refuses).
  const frozen = !ctx.demo && readOnlyReason(ctx) !== null;
  const manages = (ownerId: number | null) => !frozen && (isAdmin || (ownerId !== null && ownerId === ctx.membership.id));
  const ledger = ctx.household.mode === "ledger";
  const typeOption = ({ id, name, emoji, processingFee }: (typeof data.types)[number]) => ({ id, name, emoji, processingFee });
  const postable = data.types.filter((t) => manages(t.ownerId)).map(typeOption);
  const urgentDays = ctx.household.urgentReminderDays;
  // The payer's own check-off (0017): the owner's box leads the row.
  const checkoff = ctx.household.featureOwnerCheckoff;
  const ownerCheck = (b: (typeof data.bills)[number]) =>
    b.ownerPaid === null || b.ownerId === null ? null : { personId: b.ownerId, name: b.ownerName ?? "", paid: b.ownerPaid, isYou: b.ownerId === ctx.membership.id };

  return (
    <main>
      {/* The page header: title on the left, the page's one action in the slot on its right. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <span className="eyebrow mb-1">{ctx.household.name}</span>
          <h1 className="page-title">Bills</h1>
        </div>
        {postable.length > 0 && (
          <AddBillDialog types={postable} splitterCount={data.splitters.length} askBillDate={ctx.household.askBillDate} back="bills" />
        )}
      </header>
      <Flash ok={sp.ok} err={sp.err} />
      {data.types.length === 0 && (
        <p className="mb-5 text-sm text-ink-muted">
          {isAdmin ? (
            <>
              Add your utilities first (gas, electric, …):{" "}
              <Link className="underline underline-offset-2 hover:text-ink" href={`${householdPath(ctx.household, "/household/settings")}#utilities`}>
                Settings → Utilities
              </Link>
            </>
          ) : (
            "No utilities yet. An admin adds them in Settings."
          )}
        </p>
      )}

      <div className="panel panel-primary overflow-x-auto">
        <table className="data-table table-stack table-stack-owes">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Due</th>
              <th>Status</th>
              <th>{checkoff ? "Payments" : "Paid back"}</th>
              <th className="num">Amount</th>
              <th className="num">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-muted">No bills yet.</td>
              </tr>
            ) : (
              data.bills.map((bill) => {
                const debts = data.debts[bill.id] ?? [];
                const canManage = manages(bill.ownerId);
                const href = bill.pdfPath ? fileHref(bill.pdfPath) : null;
                const label = `${bill.typeName}, ${shortDate(bill.billDate)}`;
                const paid = bill.status === "paid";
                const owner = ownerCheck(bill);
                const stillOwed = debts.some((d) => !d.paid);
                return (
                  <tr key={bill.id}>
                    <td className="cell-bill">
                      <div className="font-medium">
                        {bill.typeEmoji ? `${bill.typeEmoji} ` : ""}{bill.typeName}
                      </div>
                      <div className="figure text-xs text-ink-muted">
                        {shortDate(bill.billDate)}
                        {ledger && bill.ownerName ? ` · ${bill.ownerName}'s account` : ""}
                      </div>
                    </td>
                    <td className="cell-due">
                      <DueChip due={bill.dueDate} paid={paid} today={data.today} urgentDays={urgentDays} />
                    </td>
                    <td className="cell-status">
                      <StatusTag paid={paid} overdue={bill.dueDate < data.today} />
                    </td>
                    <td className="cell-owes">
                      <span className="eyebrow mb-1.5 sm:hidden">{checkoff ? "Payments" : bill.ownerName ? `Paid back to ${bill.ownerName}` : "Paid back"}</span>
                      {debts.length > 0 || owner ? (
                        <PaymentCheckboxes billId={bill.id} billLabel={label} debts={debts} owner={owner} canEdit={canManage && !ctx.demo} />
                      ) : (
                        <span className="text-ink-muted">Nobody owes</span>
                      )}
                    </td>
                    <td className="num cell-amount">
                      <div className="figure font-medium">${money(bill.total)}</div>
                      <div className="figure text-xs text-ink-muted">${money(bill.perPersonCost)} ea</div>
                    </td>
                    <td className="num cell-actions">
                      <div className="flex justify-end gap-1.5">
                        {href && (
                          <>
                            <a href={href} target="_blank" className="btn-icon" title="View bill" aria-label={`View ${bill.typeName} bill`}>
                              <EyeIcon />
                            </a>
                            <a href={href} download className="btn-icon" title="Download bill" aria-label={`Download ${bill.typeName} bill`}>
                              <DownloadIcon />
                            </a>
                          </>
                        )}
                        {canManage && stillOwed && <ReminderButton billId={bill.id} typeName={bill.typeName} />}
                        {canManage && !bill.locked && (
                          <EditBillDialog
                            bill={{
                              id: bill.id, typeId: bill.typeId, typeName: bill.typeName, label, amount: bill.amount, fee: bill.fee,
                              shares: bill.shares, billDate: bill.billDate, dueDate: bill.dueDate, hasPdf: bill.pdfPath !== null, notified: bill.notified,
                            }}
                            // What the viewer may post, plus the bill's own type (its owner keeps editing it after a reassignment).
                            types={postable.some((t) => t.id === bill.typeId) ? postable : [...postable, ...data.types.filter((t) => t.id === bill.typeId).map(typeOption)]}
                            askBillDate={ctx.household.askBillDate}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={data.page} totalPages={data.totalPages} basePath={householdPath(ctx.household, "/bills")} />
    </main>
  );
}
