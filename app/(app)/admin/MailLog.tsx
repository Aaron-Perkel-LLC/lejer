"use client";

import { count, fmtWhen, kindLabel, num } from "./format";
import type { BudgetDto, FailureDto, MailKindDto } from "./types";

/** What went out today, by kind, and what failed in the last week: the Email section's record. */
export default function MailLog({ today, failures, failureDays, budget }: { today: MailKindDto[]; failures: FailureDto[]; failureDays: number; budget: BudgetDto }) {
  const sent = today.reduce((n, k) => n + k.sent, 0);
  const failed = today.reduce((n, k) => n + k.failed, 0);
  return (
    <div className="s-admin-stack">
      <section aria-labelledby="mail-today-title">
        <div className="s-admin-section-head">
          <h3 className="s-h3" id="mail-today-title">
            Today, by kind
          </h3>
          <span className="s-hint">
            {sent === 0 && failed === 0 ? "nothing yet (UTC day)" : `${num(sent)} sent${failed ? `, ${num(failed)} failed` : ""} · ${num(budget.month)} this month of ${num(budget.monthQuota)}`}
          </span>
        </div>
        {today.length > 0 && (
          <table className="s-table s-table-tight">
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col" className="s-num">Sent</th>
                <th scope="col" className="s-num">Failed</th>
              </tr>
            </thead>
            <tbody>
              {today.map((k) => (
                <tr key={k.kind}>
                  <td>{kindLabel(k.kind)}</td>
                  <td className="s-num">{num(k.sent)}</td>
                  <td className={`s-num ${k.failed ? "s-flag" : ""}`}>{k.failed ? num(k.failed) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section aria-labelledby="mail-failures-title">
        <div className="s-admin-section-head">
          <h3 className="s-h3" id="mail-failures-title">
            Failed sends, last {failureDays} days
          </h3>
          <span className="s-hint">{failures.length === 0 ? "none" : count(failures.length, "failure")}</span>
        </div>
        {failures.length > 0 && (
          <table className="s-table s-table-tight">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Kind</th>
                <th scope="col">Household</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={i}>
                  <td className="s-mono s-nowrap">{fmtWhen(f.sentAt)}</td>
                  <td>{kindLabel(f.kind)}</td>
                  <td>{f.householdName ?? "account mail"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
