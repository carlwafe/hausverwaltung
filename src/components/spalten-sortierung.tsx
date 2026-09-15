"use client";

import { useMemo, useState } from "react";

export type SortRichtung = "asc" | "desc";

/** Gemeinsame Klick-auf-Spaltenkopf-Sortierung für die handgeschriebenen Import-Tabellen
 * (Zahlungen/Kosten/Mietweiterleitungen/Kaution/Nebenkostenausgleich) — gleiches Prinzip wie die
 * generische DataTable (siehe data-table.tsx), hier aber pro Sektion selbst verdrahtet, da jede
 * eigene Editier-Felder pro Zeile hat und nicht auf DataTable umgestellt werden kann. */
export function useSpaltenSortierung<T>(
  rows: T[],
  sortValue: (row: T, spalte: string) => string | number | null,
) {
  const [spalte, setSpalte] = useState<string | null>(null);
  const [richtung, setRichtung] = useState<SortRichtung>("asc");

  const sortiert = useMemo(() => {
    if (!spalte) return rows;
    const dir = richtung === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, spalte);
      const bv = sortValue(b, spalte);
      // Fehlende Werte (z.B. ein noch nicht erkanntes Datum) immer ans Ende, unabhängig von der
      // Sortierrichtung — sonst würden sie bei "absteigend" ganz nach oben rutschen.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, spalte, richtung, sortValue]);

  function toggleSort(key: string) {
    if (spalte === key) {
      setRichtung((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSpalte(key);
      setRichtung("asc");
    }
  }

  return { sortiert, spalte, richtung, toggleSort };
}

export function SortableTh({
  label,
  spalteKey,
  aktiveSpalte,
  richtung,
  onSort,
  className,
}: {
  label: string;
  spalteKey: string;
  aktiveSpalte: string | null;
  richtung: SortRichtung;
  onSort: (spalte: string) => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(spalteKey)}
        className="inline-flex items-center gap-1 uppercase text-neutral-400 hover:text-white"
      >
        {label}
        <span className="w-3 text-white">
          {aktiveSpalte === spalteKey ? (richtung === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
