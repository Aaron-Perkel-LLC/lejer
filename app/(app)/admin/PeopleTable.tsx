"use client";

import { useEffect, useState } from "react";
import DeleteForm from "./DeleteForm";
import { count, fmtDate, fmtWhen, num } from "./format";
import { SortHeader, useSort } from "./SortHeader";
import type { SortDir } from "./sort";
import type { FormAction, PersonDto } from "./types";

type Key = "name" | "households" | "joined";
const COLUMNS: { key: Key; label: string; firstDir: SortDir; numeric?: boolean; wide?: boolean }[] = [
  { key: "name", label: "Person", firstDir: "asc" },
  { key: "households", label: "Households", firstDir: "desc" },
  { key: "joined", label: "Account since", firstDir: "desc", wide: true },
];
const value = (p: PersonDto, k: Key) => (k === "name" ? p.name : k === "households" ? p.seats.length : p.createdAt);

/** Why a person can't be emailed from here, or null. */
export const unreachable = (p: PersonDto): string | null => (p.operator ? "runs the site" : p.seats.every((s) => !s.joined) ? "never signed in" : null);

/**
 * Every account, newest first, with its address and the households it sits in. A row opens to
 * its facts and the delete; Email ticks the person in the compose form and goes there. The
 * operator's own row says so and can't be deleted from the page.
 */
export default function PeopleTable({
  people,
  focus,
  onEmail,
  deleteAction,
}: {
  people: PersonDto[];
  focus: { id: number; n: number } | null;
  onEmail: (id: number) => void;
  deleteAction: FormAction;
}) {
  const { sorted, sort, setSort, onSort } = useSort<PersonDto, Key>(people, value, { key: "joined", dir: "desc" });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!focus) return;
    setOpen(focus.id);
    document.querySelector(`[data-person="${focus.id}"]`)?.scrollIntoView({ block: "center" });
  }, [focus]);

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
          <option value="joined:desc">Newest</option>
          <option value="joined:asc">Oldest</option>
          <option value="name:asc">Name, A to Z</option>
          <option value="households:desc">Most households</option>
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
          {sorted.map((p) => {
            const isOpen = open === p.id;
            const why = unreachable(p);
            return [
              <tr key={focus?.id === p.id ? `${p.id}:${focus.n}` : p.id} data-person={p.id} className={focus?.id === p.id ? "s-row-flash" : ""}>
                <td>
                  <div className="s-cell-title">
                    <span className="s-cell-name">{p.name}</span>
                    {p.operator && <span className="s-tag-sm">operator</span>}
                    {p.mutedUpdates && <span className="s-tag-sm">updates off</span>}
                    {!p.operator && why && <span className="s-tag-sm">{why}</span>}
                  </div>
                  <div className="s-cell-sub s-mono">{p.email}</div>
                  <div className="s-cell-sub s-phone-only">account since {fmtDate(p.createdAt)}</div>
                </td>
                <td>
                  {p.seats.length === 0 ? (
                    <span className="s-dim">{p.operator ? "runs the site; in none" : "none"}</span>
                  ) : (
                    <div className="s-seats">
                      {p.seats.map((s) => (
                        <span key={s.householdId} className="s-seat" title={`/${s.slug}`}>
                          {s.householdName}
                          {s.role === "admin" && <span className="s-dim"> · admin</span>}
                          {!s.joined && <span className="s-dim"> · invited</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="s-col-wide s-nowrap">{fmtDate(p.createdAt)}</td>
                <td className="s-actions">
                  <button type="button" className="s-rowact" aria-expanded={isOpen} aria-controls={`person-${p.id}`} onClick={() => setOpen(isOpen ? null : p.id)}>
                    {isOpen ? "Close" : "Details"}
                  </button>
                  <button type="button" className="s-rowact" onClick={() => onEmail(p.id)} disabled={why !== null} title={why ? `${p.name} ${why}` : `Email ${p.name}`}>
                    Email
                  </button>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${p.id}-details`} className="s-expand" id={`person-${p.id}`}>
                  <td colSpan={COLUMNS.length + 1}>
                    <div className="s-expand-grid">
                      <section aria-label={`Facts about ${p.name}`}>
                        <h4 className="s-expand-title">Facts</h4>
                        <dl className="s-kv">
                          <div>
                            <dt>Address</dt>
                            <dd className="s-mono">{p.email}</dd>
                          </div>
                          <div>
                            <dt>Account since</dt>
                            <dd>{fmtWhen(p.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Updates from the site</dt>
                            <dd>{p.mutedUpdates ? "turned off" : "on"}</dd>
                          </div>
                          <div>
                            <dt>Households</dt>
                            <dd>{p.seats.length === 0 ? "none" : count(p.seats.length, "household")}: {num(p.seats.filter((s) => s.joined).length)} joined, {num(p.seats.filter((s) => !s.joined).length)} invited</dd>
                          </div>
                        </dl>
                      </section>
                      {p.operator ? (
                        <p className="s-hint">Runs the site. An operator account can&apos;t be deleted from here; take the address out of the operator list first.</p>
                      ) : (
                        <DeleteForm
                          action={deleteAction}
                          id={p.id}
                          summary="Delete this account…"
                          what={
                            <>
                              Removes {p.name} from every household (their unpaid shares come off the ledger; bills they fronted stay, owed to &ldquo;former
                              member&rdquo;) and deletes the account. A household they were alone in stays, empty.
                            </>
                          }
                          keyLabel="their address"
                          keyValue={p.email}
                          inputId={`delete-user-${p.id}`}
                        />
                      )}
                    </div>
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
