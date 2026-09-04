"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type KostenpositionRow = {
  id: string;
  jahr: number;
  // Nur bei aus einem Kontoauszug importierten Positionen bekannt (manuell erfasste kennen nur
  // das Jahr).
  datum: string | null;
  gebaeudeLabel: string;
  kostenartName: string;
  umlagefaehig: boolean;
  betrag: number;
  empfaenger: string | null;
  beschreibung: string | null;
};

const columns: Column<KostenpositionRow>[] = [
  {
    key: "jahr",
    label: "Jahr",
    sortValue: (k) => k.jahr,
    searchValue: (k) => String(k.jahr),
    render: (k) => (
      <Link href={`/kosten/${k.id}`} className="font-medium hover:underline">
        {k.jahr}
      </Link>
    ),
  },
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum ?? "",
    render: (k) => formatDate(k.datum),
  },
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (k) => k.gebaeudeLabel,
    searchValue: (k) => k.gebaeudeLabel,
    render: (k) => k.gebaeudeLabel,
  },
  {
    key: "kostenart",
    label: "Kostenart",
    sortValue: (k) => k.kostenartName,
    searchValue: (k) => k.kostenartName,
    render: (k) => k.kostenartName,
  },
  {
    key: "umlagefaehig",
    label: "Umlagefähig",
    sortValue: (k) => (k.umlagefaehig ? 1 : 0),
    render: (k) =>
      k.umlagefaehig ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Ja</span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Nein</span>
      ),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (k) => k.betrag,
    render: (k) => formatEuro(k.betrag),
  },
  {
    key: "empfaenger",
    label: "Empfänger",
    sortValue: (k) => k.empfaenger ?? "",
    searchValue: (k) => k.empfaenger ?? "",
    render: (k) => k.empfaenger || "–",
  },
  {
    key: "beschreibung",
    label: "Beschreibung",
    searchValue: (k) => k.beschreibung ?? "",
    render: (k) => k.beschreibung || "–",
  },
];

export function KostenTable({ rows }: { rows: KostenpositionRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kostenpositionen erfasst."
      searchPlaceholder="Kosten durchsuchen…"
    />
  );
}
