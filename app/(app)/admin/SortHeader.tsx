"use client";

import { useMemo, useState } from "react";
import { nextSort, type SortDir, type SortState, type SortValue, sortRows } from "./sort";

/** A table's sort: the rows in order, the state, and what a header click does. `value` must be a stable function. */
export function useSort<T, K extends string>(rows: readonly T[], value: (row: T, key: K) => SortValue, initial: SortState<K>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => sortRows(rows, value, sort), [rows, value, sort]);
  return { sorted, sort, setSort, onSort: (key: K, firstDir: SortDir) => setSort((s) => nextSort(s, key, firstDir)) };
}

/** A column header that sorts: the whole label is the button, and the drawn arrow says which way. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  firstDir = "asc",
  numeric = false,
  className = "",
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K, firstDir: SortDir) => void;
  firstDir?: SortDir;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${numeric ? "s-num" : ""} ${className}`.trim()}>
      <button type="button" className="s-sort" onClick={() => onSort(column, firstDir)}>
        {label}
        <svg className="s-sort-arrow" viewBox="0 0 10 10" aria-hidden="true">
          {!active ? (
            <>
              <path d="M2 3.8 5 1l3 2.8" />
              <path d="M2 6.2 5 9l3-2.8" />
            </>
          ) : sort.dir === "asc" ? (
            <path d="M2 6.5 5 3.5l3 3" />
          ) : (
            <path d="M2 3.5 5 6.5l3-3" />
          )}
        </svg>
      </button>
    </th>
  );
}
