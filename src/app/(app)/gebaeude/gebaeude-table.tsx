"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type GebaeudeRow = {
  id: string;
  strasse: string;
  haus: string | null;
  hausnummer: string;
  einheitenCount: number;
};

const columns: Column<GebaeudeRow>[] = [
  {
    key: "strasse",
    label: "Straße",
    sortValue: (g) => g.strasse,
    searchValue: (g) => g.strasse,
    render: (g) => (
      <Link href={`/gebaeude/${g.id}`} className="font-medium hover:underline">
        {g.strasse}
      </Link>
    ),
  },
  {
    key: "haus",
    label: "Haus",
    sortValue: (g) => g.haus ?? "",
    searchValue: (g) => g.haus ?? "",
    render: (g) => g.haus || "–",
  },
  {
    key: "hausnummer",
    label: "Hausnummer",
    sortValue: (g) => (Number.isNaN(Number(g.hausnummer)) ? g.hausnummer : Number(g.hausnummer)),
    searchValue: (g) => g.hausnummer,
    render: (g) => g.hausnummer,
  },
  {
    key: "einheiten",
    label: "Einheiten",
    sortValue: (g) => g.einheitenCount,
    render: (g) => g.einheitenCount,
  },
];

export function GebaeudeTable({ rows }: { rows: GebaeudeRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Gebäude angelegt."
      searchPlaceholder="Gebäude durchsuchen…"
    />
  );
}
