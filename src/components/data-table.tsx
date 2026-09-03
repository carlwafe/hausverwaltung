"use client";

import { useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** Wert für die Sortierung. Wenn nicht gesetzt, ist die Spalte nicht sortierbar. */
  sortValue?: (row: T) => string | number | Date;
  /** Text, der bei der Suche durchsucht wird. Wenn nicht gesetzt, wird die Spalte nicht durchsucht. */
  searchValue?: (row: T) => string;
  align?: "left" | "right";
  className?: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  searchPlaceholder = "Suchen…",
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
  searchPlaceholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const hatSuche = columns.some((c) => c.searchValue);

  const gefiltert = useMemo(() => {
    if (!hatSuche || !query.trim()) return rows;
    const q = normalize(query);
    return rows.filter((r) =>
      columns.some((c) => c.searchValue && normalize(c.searchValue(r)).includes(q)),
    );
  }, [rows, query, columns, hatSuche]);

  const sortiert = useMemo(() => {
    if (!sortKey) return gefiltert;
    const spalte = columns.find((c) => c.key === sortKey);
    if (!spalte?.sortValue) return gefiltert;
    const richtung = sortDir === "asc" ? 1 : -1;
    return [...gefiltert].sort((a, b) => {
      const av = spalte.sortValue!(a);
      const bv = spalte.sortValue!(b);
      if (av < bv) return -1 * richtung;
      if (av > bv) return 1 * richtung;
      return 0;
    });
  }, [gefiltert, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div>
      {hatSuche && (
        <div className="mb-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full max-w-xs rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-neutral-400 sm:w-72"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-2 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 uppercase text-neutral-400 hover:text-white"
                    >
                      {c.label}
                      <span className="w-3 text-white">
                        {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortiert.map((row) => (
              <tr key={row.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-2 text-white ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {sortiert.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-neutral-500">
                  {rows.length === 0 ? emptyMessage : "Keine Treffer für diese Suche."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
