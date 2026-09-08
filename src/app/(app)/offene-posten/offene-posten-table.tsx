"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type OffenePostenRow = {
  id: string;
  einheit: string;
  mieter: string;
  status: "AKTIV" | "BEENDET";
  soll: number;
  ist: number;
  saldovortrag: number;
  saldo: number;
};

const columns: Column<OffenePostenRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (z) => z.einheit,
    searchValue: (z) => z.einheit,
    render: (z) => (
      <Link href={`/mietvertraege/${z.id}`} className="font-medium hover:underline">
        {z.einheit}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (z) => z.mieter,
    searchValue: (z) => z.mieter,
    render: (z) => z.mieter,
  },
  {
    key: "status",
    label: "Status",
    sortValue: (z) => z.status,
    searchValue: (z) => (z.status === "AKTIV" ? "Aktiv" : "Beendet"),
    render: (z) => (
      <span className="text-neutral-400">{z.status === "AKTIV" ? "Aktiv" : "Beendet"}</span>
    ),
  },
  {
    key: "soll",
    label: "Soll",
    sortValue: (z) => z.soll,
    render: (z) => formatEuro(z.soll),
  },
  {
    key: "ist",
    label: "Ist",
    sortValue: (z) => z.ist,
    render: (z) => formatEuro(z.ist),
  },
  {
    key: "saldovortrag",
    label: "Saldovortrag",
    sortValue: (z) => z.saldovortrag,
    render: (z) =>
      z.saldovortrag === 0 ? (
        <span className="text-neutral-600">–</span>
      ) : (
        <span className={z.saldovortrag < 0 ? "text-red-400" : "text-green-400"}>
          {formatEuro(z.saldovortrag)}
        </span>
      ),
  },
  {
    key: "saldo",
    label: "Saldo",
    sortValue: (z) => z.saldo,
    render: (z) => (
      <span
        className={`font-medium ${z.saldo < 0 ? "text-red-400" : z.saldo > 0 ? "text-green-400" : "text-white"}`}
      >
        {formatEuro(z.saldo)}
      </span>
    ),
  },
];

export function OffenePostenTable({ rows }: { rows: OffenePostenRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Keine aktiven oder beendeten Mietverträge vorhanden."
      searchPlaceholder="Offene Posten durchsuchen…"
    />
  );
}
