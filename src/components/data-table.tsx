"use client";

import { Fragment, useMemo, useState } from "react";

/** Wird an render() gereicht, für Spalten, die einen Auf-/Zuklapp-Bereich unter der Zeile steuern
 * (siehe `renderExpanded` an DataTable) — z.B. ein Rohdaten-Toggle. */
export type RenderContext = { expanded: boolean; toggleExpanded: () => void };

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T, ctx: RenderContext) => React.ReactNode;
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
  selectable = false,
  onSelectionChange,
  rowClassName,
  renderExpanded,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
  searchPlaceholder?: string;
  /** Zeigt eine Auswahl-Checkbox-Spalte an; "Alle auswählen" bezieht sich auf die aktuell
   * gefilterte/sortierte Ansicht, nicht auf alle Zeilen insgesamt. */
  selectable?: boolean;
  /** Wird bei jeder Änderung der Auswahl mit den aktuell ausgewählten Zeilen aufgerufen. */
  onSelectionChange?: (selectedRows: T[]) => void;
  /** Optionale zusätzliche Klassen (z.B. eine dezente Hintergrundfarbe) für eine ganze Zeile. */
  rowClassName?: (row: T) => string;
  /** Zusätzliche volle Tabellenzeile direkt unter einer aufgeklappten Zeile (z.B. Rohdaten) —
   * eine Spalte steuert das Auf-/Zuklappen über den `ctx`-Parameter ihres render(). Immer nur
   * eine Zeile gleichzeitig aufgeklappt. Element muss selbst ein <tr> sein; colSpan (die
   * tatsächliche Spaltenzahl inkl. Auswahl-Spalte) wird von DataTable mitgegeben, siehe
   * RohdatenZeile. */
  renderExpanded?: (row: T, colSpan: number) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  function updateSelection(next: Set<string>) {
    setSelectedIds(next);
    onSelectionChange?.(rows.filter((r) => next.has(r.id)));
  }

  function toggleRow(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    updateSelection(next);
  }

  // "Alle auswählen" bezieht sich bewusst nur auf die aktuell sichtbaren (gefilterten/sortierten)
  // Zeilen, nicht auf alle Zeilen der Tabelle insgesamt.
  const alleSichtbarAusgewaehlt = sortiert.length > 0 && sortiert.every((r) => selectedIds.has(r.id));

  function toggleAllSichtbar(checked: boolean) {
    const next = new Set(selectedIds);
    for (const r of sortiert) {
      if (checked) next.add(r.id);
      else next.delete(r.id);
    }
    updateSelection(next);
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
              {selectable && (
                <th className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={alleSichtbarAusgewaehlt}
                    onChange={(e) => toggleAllSichtbar(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                  />
                </th>
              )}
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
            {sortiert.map((row) => {
              const expanded = expandedId === row.id;
              const ctx: RenderContext = {
                expanded,
                toggleExpanded: () => setExpandedId((id) => (id === row.id ? null : row.id)),
              };
              return (
                <Fragment key={row.id}>
                  <tr
                    className={`border-t border-neutral-800 hover:bg-neutral-900 ${rowClassName?.(row) ?? ""}`}
                  >
                    {selectable && (
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={(e) => toggleRow(row.id, e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-2 text-white ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                      >
                        {c.render(row, ctx)}
                      </td>
                    ))}
                  </tr>
                  {expanded && renderExpanded && renderExpanded(row, columns.length + (selectable ? 1 : 0))}
                </Fragment>
              );
            })}
            {sortiert.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-neutral-500"
                >
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
