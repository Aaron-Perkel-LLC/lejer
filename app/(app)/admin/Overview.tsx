"use client";

import { ago, count, fmtDay, fmtWhen, kindLabel, num } from "./format";
import type { BudgetDto, FailureDto, HouseholdDto, MailKindDto, Section, TotalsDto, WeekDto } from "./types";

/** Something the operator should look at, and where the page takes them for it. */
interface Attention {
  text: string;
  section: Section;
  id?: number;
}

/** How long the cron may go quiet before the page says so (it runs hourly). */
const TICK_STALE_MS = 2 * 60 * 60 * 1000;

/**
 * The first thing the operator sees: the four figures, what needs attention, how the service is
 * doing (the cron, today's mail), and the last eight weeks. Every line links into the section
 * where the thing can be acted on; nothing here is actionable itself.
 */
export default function Overview({
  totals,
  households,
  today,
  failures,
  weekly,
  budget,
  failureDays,
  now,
}: {
  totals: TotalsDto;
  households: HouseholdDto[];
  today: MailKindDto[];
  failures: FailureDto[];
  weekly: WeekDto[];
  budget: BudgetDto;
  failureDays: number;
  now: string;
}) {
  const attention: Attention[] = [];
  for (const h of households) {
    if (h.memberCount === 0) attention.push({ text: `${h.name} has nobody left in it.`, section: "households", id: h.id });
    if (h.deletion) attention.push({ text: `${h.name}: ${h.deletion}.`, section: "households", id: h.id });
    if (h.lastTickOutcome?.startsWith("error")) attention.push({ text: `${h.name}'s last tick failed: ${h.lastTickOutcome.slice(7)}`, section: "households", id: h.id });
  }
  const ticks = households.map((h) => h.lastRunAt).filter((t): t is string => t !== null).sort();
  const lastTick = ticks.at(-1) ?? null;
  const stale = (iso: string) => new Date(now).getTime() - new Date(iso).getTime() > TICK_STALE_MS;
  if (lastTick) {
    for (const h of households) if (!h.lastRunAt && stale(h.createdAt)) attention.push({ text: `${h.name} has never been ticked.`, section: "households", id: h.id });
    if (stale(lastTick)) attention.push({ text: `The cron hasn't ticked since ${fmtWhen(lastTick)}.`, section: "households" });
  } else if (households.some((h) => stale(h.createdAt))) {
    attention.push({ text: "The cron has never ticked.", section: "households" });
  }
  if (failures.length > 0) attention.push({ text: `${count(failures.length, "send")} failed in the last ${failureDays} days.`, section: "email" });

  const sentToday = today.reduce((n, k) => n + k.sent, 0);
  const failedToday = today.reduce((n, k) => n + k.failed, 0);
  const byKind = today
    .filter((k) => k.sent > 0)
    .sort((a, b) => b.sent - a.sent)
    .map((k) => `${num(k.sent)} ${kindLabel(k.kind).toLowerCase()}`)
    .join(", ");
  const lastBatch = households.filter((h) => h.lastSentAt).sort((a, b) => (a.lastSentAt! < b.lastSentAt! ? 1 : -1))[0] ?? null;
  const empty = households.filter((h) => h.memberCount === 0).length;
  const thisWeek = weekly.at(-1)?.week;

  return (
    <div className="s-admin-stack">
      <dl className="s-stats">
        <div>
          <dt>Households</dt>
          <dd>
            {num(totals.households)}
            <small>
              {totals.householdsDeleting > 0 ? ` ${totals.householdsDeleting} deleting` : ""}
              {empty > 0 ? ` ${empty} empty` : ""}
            </small>
          </dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>
            {num(totals.users)}
            <small>
              {" "}
              {num(totals.membershipsJoined)} joined, {num(totals.membershipsPending)} invited
            </small>
          </dd>
        </div>
        <div>
          <dt>Bills</dt>
          <dd>
            {num(totals.bills)}
            <small> {num(totals.billsUnpaid)} unpaid</small>
          </dd>
        </div>
        <div>
          <dt>Email this month</dt>
          <dd>
            {num(budget.month)}
            <small>
              {" "}
              of {num(budget.monthQuota)} · {num(budget.today)} today
            </small>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="attention-title">
        <div className="s-admin-section-head">
          <h3 className="s-h3" id="attention-title">
            Needs attention
          </h3>
          <span className="s-hint">{attention.length === 0 ? "nothing" : count(attention.length, "thing")}</span>
        </div>
        {attention.length === 0 ? (
          <p className="s-prose">Nothing: every household has people in it, the cron is ticking, and no mail has failed this week.</p>
        ) : (
          <ul className="s-attn">
            {attention.map((a, i) => (
              <li key={i}>
                <a className="s-link" href={`#${a.section}${a.id ? `:${a.id}` : ""}`}>
                  {a.text}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="service-title">
        <div className="s-admin-section-head">
          <h3 className="s-h3" id="service-title">
            Service
          </h3>
        </div>
        <dl className="s-kv">
          <div>
            <dt>Cron</dt>
            <dd>{lastTick ? `last tick ${ago(lastTick, now)} (${fmtWhen(lastTick)}), ${count(ticks.length, "household")} ticked` : "has never ticked"}</dd>
          </div>
          <div>
            <dt>Reminders</dt>
            <dd>{lastBatch ? `last batch ${ago(lastBatch.lastSentAt, now)}: ${count(lastBatch.lastSentCount, "email")} for ${lastBatch.name}` : "no batch sent yet"}</dd>
          </div>
          <div>
            <dt>Email today</dt>
            <dd>
              {sentToday === 0 && failedToday === 0 ? "nothing yet (UTC day)" : `${num(sentToday)} sent${byKind ? ` (${byKind})` : ""}${failedToday ? `, ${num(failedToday)} failed` : ""}`}
              {" · "}
              <a className="s-link" href="#email">
                the log
              </a>
            </dd>
          </div>
          <div>
            <dt>Ceilings</dt>
            <dd>
              {num(budget.dailyCeiling)} a day is the app&apos;s own stop; {num(budget.monthQuota)} a month is the plan&apos;s.
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="weeks-title">
        <div className="s-admin-section-head">
          <h3 className="s-h3" id="weeks-title">
            Last {weekly.length} weeks
          </h3>
          <span className="s-hint">what was created, by ISO week (UTC)</span>
        </div>
        <table className="s-table s-table-tight">
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col" className="s-num">Households</th>
              <th scope="col" className="s-num">People</th>
              <th scope="col" className="s-num">Bills</th>
            </tr>
          </thead>
          <tbody>
            {[...weekly].reverse().map((w) => (
              <tr key={w.week}>
                <td className="s-nowrap">{w.week === thisWeek ? `This week (${fmtDay(w.week)})` : fmtDay(w.week)}</td>
                <td className="s-num">{w.households ? num(w.households) : ""}</td>
                <td className="s-num">{w.users ? num(w.users) : ""}</td>
                <td className="s-num">{w.bills ? num(w.bills) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
