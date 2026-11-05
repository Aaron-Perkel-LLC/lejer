"use client";

import { useEffect, useState } from "react";
import DeleteForm from "./DeleteForm";
import { ago, count, fmtDate, fmtWhen, modeLabel, num } from "./format";
import { SortHeader, useSort } from "./SortHeader";
import type { SortDir } from "./sort";
import type { FormAction, HouseholdDto } from "./types";

type Key = "name" | "people" | "bills" | "created" | "activity" | "tick";
const COLUMNS: { key: Key; label: string; firstDir: SortDir; numeric?: boolean; wide?: boolean }[] = [
  { key: "name", label: "Household", firstDir: "asc" },
  { key: "people", label: "People", firstDir: "desc", numeric: true },
  { key: "bills", label: "Bills", firstDir: "desc", numeric: true },
  { key: "created", label: "Created", firstDir: "desc", wide: true },
  { key: "activity", label: "Last activity", firstDir: "desc", wide: true },
  { key: "tick", label: "Last tick", firstDir: "desc", wide: true },
];
const value = (h: HouseholdDto, k: Key) =>
  k === "name" ? h.name : k === "people" ? h.joinedCount : k === "bills" ? h.billCount : k === "created" ? h.createdAt : k === "activity" ? h.lastActivity : h.lastRunAt;

/** What's wrong with a household, in two or three words, on its row. */
function flags(h: HouseholdDto): string[] {
  const out: string[] = [];
  if (h.memberCount === 0) out.push("nobody left in it");
  if (h.deletion) out.push(h.deletion);
  if (!h.remindersEnabled) out.push("reminders off");
  if (h.lastTickOutcome?.startsWith("error")) out.push("last tick failed");
  return out;
}

/**
 * Every household, sortable by any column, most recently active first. A row opens to its
 * members, the facts the row has no room for, and the delete. Email ticks the household in the
 * compose form and goes there. `focus` is a row to scroll to and flash (a link from Overview).
 */
export default function HouseholdsTable({
  households,
  focus,
  now,
  onEmail,
  deleteAction,
}: {
  households: HouseholdDto[];
  focus: { id: number; n: number } | null;
  now: string;
  onEmail: (id: number) => void;
  deleteAction: FormAction;
}) {
  const { sorted, sort, setSort, onSort } = useSort<HouseholdDto, Key>(households, value, { key: "activity", dir: "desc" });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!focus) return;
    setOpen(focus.id);
    document.querySelector(`[data-household="${focus.id}"]`)?.scrollIntoView({ block: "center" });
  }, [focus]);

  if (households.length === 0) return <p className="s-prose">No households yet. The first sign-up creates one.</p>;

  return (
    <div className="s-admin-stack">
      <label className="s-sort-phone">
        Sort by
        <select
          className="s-input s-input-sm"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [Key, SortDir];
            setSort({ key, dir });
          }}
        >
          <option value="activity:desc">Most recently active</option>
          <option value="created:desc">Newest</option>
          <option value="created:asc">Oldest</option>
          <option value="name:asc">Name, A to Z</option>
          <option value="people:desc">Most people</option>
          <option value="bills:desc">Most bills</option>
          <option value="tick:asc">Longest since a tick</option>
        </select>
      </label>
      <table className="s-table">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <SortHeader key={c.key} label={c.label} column={c.key} sort={sort} onSort={onSort} firstDir={c.firstDir} numeric={c.numeric} className={c.wide ? "s-col-wide" : c.key === "name" ? "s-col-main" : ""} />
            ))}
            <th scope="col" className="s-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => {
            const isOpen = open === h.id;
            const pending = h.memberCount - h.joinedCount;
            const bad = flags(h);
            return [
              <tr key={focus?.id === h.id ? `${h.id}:${focus.n}` : h.id} data-household={h.id} className={focus?.id === h.id ? "s-row-flash" : ""}>
                <td>
                  <div className="s-cell-title">
                    <span className="s-cell-name">{h.name}</span>
                    <span className="s-tag-sm">{modeLabel(h.mode)}</span>
                    <span className="s-tag-sm">{h.theme}</span>
                  </div>
                  <div className="s-cell-sub s-mono">/{h.slug}</div>
                  {bad.length > 0 && <div className="s-cell-sub s-flag">{bad.join(" · ")}</div>}
                  <div className="s-cell-sub s-phone-only">
                    created {fmtDate(h.createdAt)} · active {ago(h.lastActivity, now)}
                    {h.lastRunAt ? ` · ticked ${ago(h.lastRunAt, now)}` : " · never ticked"}
                  </div>
                </td>
                <td className="s-num">
                  {num(h.joinedCount)}
                  {pending > 0 && <span className="s-dim"> +{pending}</span>}
                </td>
                <td className="s-num">{num(h.billCount)}</td>
                <td className="s-col-wide s-nowrap">{fmtDate(h.createdAt)}</td>
                <td className="s-col-wide s-nowrap">{ago(h.lastActivity, now)}</td>
                <td className="s-col-wide">
                  {h.lastRunAt ? (
                    <>
                      <span className="s-nowrap">{ago(h.lastRunAt, now)}</span>
                      {h.lastTickOutcome && <span className={`s-cell-sub ${h.lastTickOutcome.startsWith("error") ? "s-flag" : ""}`}>{h.lastTickOutcome}</span>}
                    </>
                  ) : (
                    <span className="s-dim">never</span>
                  )}
                </td>
                <td className="s-actions">
                  <button type="button" className="s-rowact" aria-expanded={isOpen} aria-controls={`household-${h.id}`} onClick={() => setOpen(isOpen ? null : h.id)}>
                    {isOpen ? "Close" : "Details"}
                  </button>
                  <button type="button" className="s-rowact" onClick={() => onEmail(h.id)} disabled={h.joinedCount === 0} title={h.joinedCount === 0 ? "Nobody here has signed in" : `Email ${h.name}`}>
                    Email
                  </button>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${h.id}-details`} className="s-expand" id={`household-${h.id}`}>
                  <td colSpan={COLUMNS.length + 1}>
                    <div className="s-expand-grid">
                      <section aria-label={`Members of ${h.name}`}>
                        <h4 className="s-expand-title">{count(h.members.length, "member")}</h4>
                        {h.members.length === 0 ? (
                          <p className="s-flag">Nobody left in it.</p>
                        ) : (
                          <ul className="s-expand-list">
                            {h.members.map((m) => (
                              <li key={m.userId}>
                                <span className="s-cell-title">
                                  <span className="s-cell-name">{m.name}</span>
                                  {m.role === "admin" && <span className="s-tag-sm">admin</span>}
                                  {!m.joined && <span className="s-tag-sm">invited</span>}
                                </span>
                                <span className="s-cell-sub s-mono">{m.email}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                      <section aria-label={`Facts about ${h.name}`}>
                        <h4 className="s-expand-title">Facts</h4>
                        <dl className="s-kv">
                          <div>
                            <dt>Created</dt>
                            <dd>{fmtDate(h.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Last activity</dt>
                            <dd>{fmtWhen(h.lastActivity)}</dd>
                          </div>
                          <div>
                            <dt>Reminders</dt>
                            <dd>{h.remindersEnabled ? "on" : "off"}</dd>
                          </div>
                          <div>
                            <dt>Last tick</dt>
                            <dd>{h.lastRunAt ? `${fmtWhen(h.lastRunAt)}${h.lastTickOutcome ? ` · ${h.lastTickOutcome}` : ""}` : "never"}</dd>
                          </div>
                          <div>
                            <dt>Last reminder batch</dt>
                            <dd>{h.lastSentAt ? `${count(h.lastSentCount, "email")}, ${fmtWhen(h.lastSentAt)}` : "none yet"}</dd>
                          </div>
                          {h.deletion && (
                            <div>
                              <dt>Deletion</dt>
                              <dd className="s-flag">{h.deletion}</dd>
                            </div>
                          )}
                        </dl>
                      </section>
                    </div>
                    <DeleteForm
                      action={deleteAction}
                      id={h.id}
                      summary="Delete this household…"
                      what={<>Deletes {h.name} right now: every bill, file and membership, with no email to anyone. The people keep their accounts.</>}
                      keyLabel="its slug"
                      keyValue={h.slug}
                      inputId={`delete-household-${h.id}`}
                    />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
