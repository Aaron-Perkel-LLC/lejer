import Link from "next/link";
import AddBillDialog from "@/app/(household)/[household]/bills/AddBillDialog";
import PaymentCheckboxes from "@/app/(household)/[household]/bills/PaymentCheckboxes";
import ReminderButton from "@/app/(household)/[household]/bills/ReminderButton";
import WelcomeBanner from "@/app/(household)/[household]/welcome/WelcomeBanner";
import CalendarLinks from "@/app/components/CalendarLinks";
import DueChip from "@/app/components/DueChip";
import Flash from "@/app/components/Flash";
import StatusTag from "@/app/components/StatusTag";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import { readOnlyReason, requireUser } from "@/lib/auth";
import { ledgerGroups } from "@/lib/bills";
import { hasFeature } from "@/lib/features";
import { fileHref } from "@/lib/files";
import { daysBetween } from "@/lib/time";
import { loadDashboard } from "@/lib/views";
import { householdPath } from "@/lib/paths";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// The overview, where every household email lands. The header's slot holds "+ Add bill" for
// anyone who can post. Under the summary strip come the two working lists: "Owed to you" (bills
// the viewer fronts, with their check-offs and Remind, so an owner who was just paid back ticks
// it here) and "You owe" (each share still open, and whom to pay). Paid history lives on Bills.
// Single-payer: the strip says what you owe the payer (or, for the payer, what the house owes
// them, and the ledger is hidden since it would only repeat that). Ledger mode: what you owe,
// plus who owes whom across the house.
export default async function Dashboard({ searchParams }: PageProps<"/[household]">) {
  const ctx = await requireUser();
  const { ok, err } = await searchParams;
  const data = await loadDashboard(ctx);

  const me = ctx.membership.id;
  // The viewer's own pairs first: what you owe, then what you're owed, then everyone else's.
  const mine = (p: (typeof data.pairs)[number]) => (p.debtorId === me ? 0 : p.ownerId === me ? 1 : 2);
  // Gross rows as recorded; two people who owe each other sit together with a settling hint.
  const ledger = ledgerGroups([...data.pairs].sort((a, b) => mine(a) - mine(b)));
  const who = (id: number | null, name: string | null) => (id === me ? "you" : (name ?? "the house"));
  const owedToMe = data.pairs.filter((p) => p.ownerId === me);
  const iOweTo = [...new Set(data.pairs.filter((p) => p.debtorId === me).map((p) => p.owner ?? "the house"))];
  const names = (list: string[]) =>
    list.length === 1 ? list[0] : list.length <= 3 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : `${list.length} roommates`;
  const owedToMeTotal = Math.round(owedToMe.reduce((s, p) => s + p.amount * 100, 0)) / 100;
  const singlePayer = ctx.household.mode === "single_payer";
  const iAmPayer = singlePayer && data.ownsTypes;
  const frozen = !ctx.demo && readOnlyReason(ctx) !== null;
  const isAdmin = ctx.membership.role === "admin";
  // The tour is offered, never forced: a strip until they take it or dismiss it (writable only).
  const offerTour = !readOnlyReason(ctx) && hasFeature(ctx.household, "welcomeTour") && !ctx.membership.welcomedAt;
  const postable = frozen
    ? []
    : data.types.filter((t) => isAdmin || t.ownerId === me).map(({ id, name, emoji, processingFee }) => ({ id, name, emoji, processingFee }));
  const owedBills = data.open.filter((b) => b.ownerId === me && b.status === "unpaid");
  // The payer's own check-off (0017): the owner's box leads the row, and the bill stays here until it's ticked.
  const checkoff = ctx.household.featureOwnerCheckoff;
  const ownerCheck = (b: (typeof data.open)[number]) =>
    b.ownerPaid === null || b.ownerId === null ? null : { personId: b.ownerId, name: b.ownerName ?? "", paid: b.ownerPaid, isYou: b.ownerId === me };
  const oweBills = data.open.filter((b) => b.debts.some((d) => d.personId === me && !d.paid));
  const today = new Date(`${data.today}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const nextDue = data.owed.nextDue;
  // Nothing due from the viewer: the next date that matters is the soonest bill they're owed on.
  const collect = nextDue ? null : data.collect;
  const shownDue = nextDue?.dueDate ?? collect?.dueDate ?? null;
  const late = shownDue ? -daysBetween(data.today, shownDue) : 0;
  const lateText = late === 1 ? "1 day late" : `${late} days late`;
  const urgentDays = ctx.household.urgentReminderDays;
  const sectionRule = (label: string) => (
    <div className="mb-2 flex items-center gap-3">
      <span className="eyebrow">{label}</span>
      <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
    </div>
  );
  const pdfLinks = (pdfPath: string | null, typeName: string) => {
    const href = pdfPath ? fileHref(pdfPath) : null;
    return (
      href && (
        <>
          <a href={href} target="_blank" className="btn-icon" title="View bill" aria-label={`View ${typeName} bill`}>
            <EyeIcon />
          </a>
          <a href={href} download className="btn-icon" title="Download bill" aria-label={`Download ${typeName} bill`}>
            <DownloadIcon />
          </a>
        </>
      )
    );
  };

  return (
    <main>
      {/* The page header: title on the left, the page's one action in the slot on its right. */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <span className="eyebrow mb-1">{ctx.household.name}</span>
          <h1 className="page-title">Hi, {ctx.user.name}</h1>
          <p className="text-sm text-ink-muted">As of {today}</p>
        </div>
        {postable.length > 0 && (
          <AddBillDialog types={postable} splitterCount={data.splitterCount} askBillDate={ctx.household.askBillDate} back="overview" />
        )}
      </header>
      <Flash ok={ok} err={err} />
      {offerTour && <WelcomeBanner household={ctx.household} />}
      {/* A new household's first steps: nothing can be posted until it has a utility (onboarding
          offers four, all of which can be unchecked), and nothing is split until someone else
          joins, so an admin still alone is pointed at Members. */}
      {!frozen && data.types.length === 0 && (
        <div className="panel mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="max-w-[60ch]">
            <span className="eyebrow mb-1">First step</span>
            <p className="text-sm">
              {isAdmin && !ctx.demo
                ? "Add the utilities your household splits (gas, electric, internet…). Then anyone who owns one can post its bills here."
                : "No utilities yet. Once an admin adds them in Settings, bills can be posted here."}
            </p>
          </div>
          {isAdmin && !ctx.demo && (
            <Link className="btn btn-primary" href={`${householdPath(ctx.household, "/household/settings")}#utilities`}>
              Add utilities
            </Link>
          )}
        </div>
      )}
      {!frozen && data.types.length > 0 && data.memberCount === 1 && isAdmin && !ctx.demo && (
        <div className="panel mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="max-w-[60ch]">
            <span className="eyebrow mb-1">Next step</span>
            <p className="text-sm">Invite your roommates. Each one gets an email invitation, and new bills split between everyone in the household.</p>
          </div>
          <Link className="btn btn-primary" href={householdPath(ctx.household, "/household")}>
            Invite roommates
          </Link>
        </div>
      )}

      <div className="panel panel-primary mb-8 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          {iAmPayer ? (
            <>
              <span className="eyebrow mb-1">Owed to you</span>
              <div className="figure text-[1.7rem] font-semibold leading-tight">${money(owedToMeTotal)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {owedToMe.length ? `from ${names(owedToMe.map((p) => p.debtor))}` : "everyone's paid you back"}
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow mb-1">You owe</span>
              <div className="figure text-[1.7rem] font-semibold leading-tight">${money(data.owed.amount)}</div>
              <div className="mt-0.5 text-xs text-ink-muted">
                {!ctx.membership.splitsBills
                  ? "you don't split bills here"
                  : data.owed.billIds.length
                    ? `to ${names(iOweTo)}, across ${data.owed.billIds.length} unpaid ${data.owed.billIds.length === 1 ? "bill" : "bills"}`
                    : "all settled up"}
              </div>
              {/* Ledger mode: an owner is owed too, and that belongs in the first answer. */}
              {owedToMeTotal > 0 && (
                <div className="mt-1.5 text-xs text-ink-muted">
                  and you&apos;re owed <span className="figure font-semibold text-ink">${money(owedToMeTotal)}</span> from {names(owedToMe.map((p) => p.debtor))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Next due</span>
          <div className={`figure text-[1.7rem] font-semibold leading-tight ${shownDue ? "" : "text-ink-muted"}`}>{shownDue ? dayMonth(shownDue) : "None"}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {nextDue ? (
              <>
                {nextDue.typeName}
                {late > 0 && (
                  <>
                    {" "}
                    · <span className="font-semibold text-unpaid">{lateText}</span>
                  </>
                )}
              </>
            ) : collect ? (
              <>
                {collect.typeName} · {names(collect.debtors)} {collect.debtors.length === 1 ? "hasn't" : "haven't"} paid you
                {late > 0 && (
                  <>
                    , <span className="font-semibold text-unpaid">{lateText}</span>
                  </>
                )}
              </>
            ) : (
              "nothing due from you"
            )}
          </div>
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Bills on record</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">{data.totalBills}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{data.totalBills ? "in this household" : "none posted yet"}</div>
        </div>
      </div>

      {owedBills.length > 0 && (
        <section className="mb-8">
          {sectionRule(checkoff ? "Your bills" : "Owed to you")}
          <div className="panel overflow-x-auto">
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
                {owedBills.map((bill) => {
                  const label = `${bill.typeName}, ${dayMonth(bill.billDate)}`;
                  const stillOwed = bill.debts.some((d) => !d.paid);
                  return (
                    <tr key={bill.id}>
                      <td className="cell-bill">
                        <div className="font-medium">
                          {bill.typeEmoji ? `${bill.typeEmoji} ` : ""}{bill.typeName}
                        </div>
                        <div className="figure text-xs text-ink-muted">{dayMonth(bill.billDate)}</div>
                      </td>
                      <td className="cell-due">
                        <DueChip due={bill.dueDate} paid={false} today={data.today} urgentDays={urgentDays} />
                      </td>
                      <td className="cell-status">
                        <StatusTag paid={false} overdue={bill.dueDate < data.today} />
                        {!stillOwed && bill.ownerPaid === false && <div className="mt-1 text-xs text-ink-muted">Everyone&apos;s paid you back</div>}
                      </td>
                      <td className="cell-owes">
                        <span className="eyebrow mb-1.5 sm:hidden">{checkoff ? "Payments" : "Paid back to you"}</span>
                        <PaymentCheckboxes billId={bill.id} billLabel={label} debts={bill.debts} owner={ownerCheck(bill)} canEdit={!frozen && !ctx.demo} />
                      </td>
                      <td className="num cell-amount">
                        <div className="figure font-medium">${money(bill.total)}</div>
                        <div className="figure text-xs text-ink-muted">${money(bill.perPersonCost)} ea</div>
                      </td>
                      <td className="num cell-actions">
                        <div className="flex justify-end gap-1.5">
                          {pdfLinks(bill.pdfPath, bill.typeName)}
                          {!frozen && stillOwed && <ReminderButton billId={bill.id} typeName={bill.typeName} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {oweBills.length > 0 && (
        <section className="mb-8">
          {sectionRule("You owe")}
          <div className="panel overflow-x-auto">
            <table className="data-table table-stack table-stack-bills">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="num">Your share</th>
                  <th className="num">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {oweBills.map((bill) => (
                  <tr key={bill.id}>
                    <td className="cell-bill">
                      <div className="font-medium">
                        {bill.typeEmoji ? `${bill.typeEmoji} ` : ""}{bill.typeName}
                      </div>
                      <div className="figure text-xs text-ink-muted">
                        {dayMonth(bill.billDate)} · pay {bill.ownerName ?? "the house"}
                      </div>
                    </td>
                    <td className="cell-due">
                      <DueChip due={bill.dueDate} paid={false} today={data.today} urgentDays={urgentDays} />
                    </td>
                    <td className="cell-status">
                      <StatusTag paid={false} overdue={bill.dueDate < data.today} />
                    </td>
                    <td className="num cell-amount">
                      <div className="figure font-medium">${money(bill.perPersonCost)}</div>
                      <div className="figure text-xs text-ink-muted">of ${money(bill.total)}</div>
                    </td>
                    <td className="num cell-actions">
                      <div className="flex justify-end gap-1.5">{pdfLinks(bill.pdfPath, bill.typeName)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {owedBills.length === 0 && oweBills.length === 0 && (
        <div className="panel mb-8 px-5 py-6 text-center text-sm text-ink-muted">
          {data.totalBills ? "Nothing open for you. Everything you owe or are owed is settled." : "No bills yet."}
        </div>
      )}

      {!iAmPayer && (
        <section className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span className="eyebrow">The house ledger</span>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          {ledger.length === 0 ? (
            <div className="panel px-5 py-4 text-sm text-ink-muted">Everyone&rsquo;s settled up. Nothing owed in the house.</div>
          ) : (
            <div className="panel divide-y divide-line-soft">
              {ledger.map((g) => (
                <div key={g.rows.map((p) => `${p.debtorId}->${p.ownerId ?? `house-${p.owner}`}`).join(",")} className="px-5 py-2.5 text-sm">
                  {g.rows.map((p) => (
                    <div key={`${p.debtorId}->${p.ownerId}`} className="flex items-baseline justify-between gap-3 py-0.5">
                      <span>
                        <strong className={p.debtorId === me ? "text-unpaid" : ""}>{p.debtorId === me ? "You" : p.debtor}</strong>{" "}
                        <span className="text-ink-muted">{p.debtorId === me ? "owe" : "owes"}</span> <strong>{who(p.ownerId, p.owner)}</strong>
                      </span>
                      <span className="figure font-semibold">${money(p.amount)}</span>
                    </div>
                  ))}
                  {/* A hint, never the headline: the record stays per bill, in both directions. */}
                  {g.settle && (
                    <p className="mt-1 max-w-[60ch] text-xs text-ink-muted">
                      {g.settle === "even" ? (
                        <>Settling at once? You&apos;re even: check off each other&apos;s bills.</>
                      ) : (
                        <>
                          Settling at once? {g.settle.debtorId === me ? "You pay" : `${g.settle.debtor} pays`} {who(g.settle.ownerId, g.settle.owner)}{" "}
                          <span className="figure">${money(g.settle.amount)}</span> and{" "}
                          {g.rows.some((p) => p.debtorId === me || p.ownerId === me) ? "you both" : "they both"} check off each other&apos;s bills.
                        </>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-soft pt-4 text-sm text-ink-muted">
        <Link href={householdPath(ctx.household, "/bills")} className="underline decoration-line underline-offset-2 hover:text-ink">
          Every bill, paid ones too, is on Bills
        </Link>
        {data.calendarToken && (
          <div className="flex flex-wrap items-center gap-2">
            <span>Due dates in your calendar:</span>
            <CalendarLinks token={data.calendarToken} />
          </div>
        )}
      </div>
    </main>
  );
}
