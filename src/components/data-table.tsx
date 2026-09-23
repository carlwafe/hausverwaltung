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
  rowId,
  renderExpanded,
  dateValue,
  selectFilter,
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
  /** Optionale DOM-`id` fürs `<tr>` (z.B. für einen `#anchor`-Link von einer anderen Seite auf
   * eine bestimmte Zeile). */
  rowId?: (row: T) => string;
  /** Zusätzliche volle Tabellenzeile direkt unter einer aufgeklappten Zeile (z.B. Rohdaten) —
   * eine Spalte steuert das Auf-/Zuklappen über den `ctx`-Parameter ihres render(). Immer nur
   * eine Zeile gleichzeitig aufgeklappt. Element muss selbst ein <tr> sein; colSpan (die
   * tatsächliche Spaltenzahl inkl. Auswahl-Spalte) wird von DataTable mitgegeben, siehe
   * RohdatenZeile. */
  renderExpanded?: (row: T, colSpan: number) => React.ReactNode;
  /** ISO-Datum (oder null) einer Zeile — wenn gesetzt, werden zusätzlich zur Suche zwei
   * Von/Bis-Datumsfelder angezeigt. Zeilen ohne Datum (z.B. manuell erfasste Kosten, die nur ein
   * Jahr kennen) verschwinden dabei, sobald von/bis aktiv gefiltert wird — ein unbekanntes Datum
   * lässt sich nicht als "im Zeitraum" bestätigen. */
  dateValue?: (row: T) => string | null;
  /** Zusätzliches Dropdown zum Vorfiltern auf einen exakten Wert (z.B. Kostenart) — ergänzt die
   * freie Text-Suche um eine schnelle Eingrenzung, ohne den Suchbegriff tippen zu müssen. Die
   * Optionen werden vom Aufrufer übergeben (typischerweise aus den vorhandenen Zeilen abgeleitet),
   * "" (Platzhalter-Option) bedeutet "kein Filter". */
  selectFilter?: {
    label: string;
    value: (row: T) => string;
    options: { value: string; label: string }[];
    placeholder?: string;
  };
}) {
  const [query, setQuery] = useState("");
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [selectFilterValue, setSelectFilterValue] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hatSuche = columns.some((c) => c.searchValue);

  const gefiltert = useMemo(() => {
    let ergebnis = rows;
    if (hatSuche && query.trim()) {
      const q = normalize(query);
      ergebnis = ergebnis.filter((r) =>
        columns.some((c) => c.searchValue && normalize(c.searchValue(r)).includes(q)),
      );
    }
    if (dateValue && (von || bis)) {
      ergebnis = ergebnis.filter((r) => {
        const tag = dateValue(r)?.slice(0, 10);
        if (!tag) return false;
        if (von && tag < von) return false;
        if (bis && tag > bis) return false;
        return true;
      });
    }
    if (selectFilter && selectFilterValue) {
      ergebnis = ergebnis.filter((r) => selectFilter.value(r) === selectFilterValue);
    }
    return ergebnis;
  }, [rows, query, columns, hatSuche, dateValue, von, bis, selectFilter, selectFilterValue]);

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
      {(hatSuche || dateValue || selectFilter) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {hatSuche && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full max-w-xs rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-neutral-400 sm:w-72"
            />
          )}
          {selectFilter && (
            // Eigener Pfeil statt der nativen Browser-Chevron: die native Darstellung von
            // <select> weicht je nach Browser/Betriebssystem in ihrem intrinsischen Mindestmaß
            // von einem <input> ab (v.a. bei langen <option>-Texten) und ließ sich mit
            // Breiten-Klassen allein nicht zuverlässig exakt an das Suchfeld angleichen —
            // appearance-none entfernt die native Darstellung komplett, wodurch das Feld exakt
            // wie das Suchfeld daneben aus denselben Box-Maßen (Breite, Höhe, Padding) besteht.
            <div className="relative w-full max-w-xs sm:w-72">
              <select
                value={selectFilterValue}
                onChange={(e) => setSelectFilterValue(e.target.value)}
                className="w-full appearance-none rounded-md border border-neutral-700 bg-neutral-950 py-2 pl-3 pr-8 text-sm text-white outline-none focus:border-neutral-400"
              >
                <option value="">{selectFilter.placeholder ?? `Alle (${selectFilter.label})`}</option>
                {selectFilter.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400"
              >
                <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {dateValue && (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <label className="flex items-center gap-1.5">
                von
                <input
                  type="date"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                  className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
                />
              </label>
              <label className="flex items-center gap-1.5">
                bis
                <input
                  type="date"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                  className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
                />
              </label>
              {(von || bis) && (
                <button
                  type="button"
                  onClick={() => {
                    setVon("");
                    setBis("");
                  }}
                  className="text-xs text-neutral-500 underline hover:text-white"
                >
                  zurücksetzen
                </button>
              )}
            </div>
          )}
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
                    id={rowId?.(row)}
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
