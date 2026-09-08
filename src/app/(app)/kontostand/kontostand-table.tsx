"use client";

import { DataTable, type Column } from "@/components/data-table";
import type { KontostandKategorie } from "@/lib/kontostand";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

const KATEGORIE_LABEL: Record<KontostandKategorie, string> = {
  zahlung: "Zahlung",
  kosten: "Kosten",
  mietweiterleitung: "Mietweiterleitung/Einlage",
  kaution: "Kaution",
  sonstige: "Sonstige",
};

export type KontostandRow = {
  id: string;
  datum: string;
  betrag: number;
  kategorie: KontostandKategorie;
  beschreibung: string;
  kontostand: number;
};

const columns: Column<KontostandRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (z) => z.datum,
    render: (z) => formatDate(z.datum),
  },
  {
    key: "kategorie",
    label: "Kategorie",
    sortValue: (z) => KATEGORIE_LABEL[z.kategorie],
    searchValue: (z) => KATEGORIE_LABEL[z.kategorie],
    render: (z) => (
      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
        {KATEGORIE_LABEL[z.kategorie]}
      </span>
    ),
  },
  {
    key: "beschreibung",
    label: "Beschreibung",
    sortValue: (z) => z.beschreibung,
    searchValue: (z) => z.beschreibung,
    render: (z) => z.beschreibung || "–",
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (z) => z.betrag,
    render: (z) => (
      <span className={z.betrag < 0 ? "text-red-400" : "text-green-400"}>{formatEuro(z.betrag)}</span>
    ),
  },
  {
    key: "kontostand",
    label: "Kontostand danach",
    sortValue: (z) => z.kontostand,
    render: (z) => <span className="font-medium text-white">{formatEuro(z.kontostand)}</span>,
  },
];

export function KontostandTable({ rows }: { rows: KontostandRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Keine Buchungen erfasst."
      searchPlaceholder="Kontostand-Verlauf durchsuchen…"
    />
  );
}
