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

const statusLabel: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const statusColor: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

export type VertragRow = {
  id: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  beginn: string;
  ende: string | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
  status: "AKTIV" | "GEPLANT" | "BEENDET";
};

const columns: Column<VertragRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (v) => v.einheitBezeichnung,
    searchValue: (v) => v.einheitBezeichnung,
    render: (v) => (
      <Link href={`/mietvertraege/${v.id}`} className="font-medium hover:underline">
        {v.einheitBezeichnung}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (v) => v.mieterNamen,
    searchValue: (v) => v.mieterNamen,
    render: (v) => v.mieterNamen,
  },
  {
    key: "beginn",
    label: "Beginn",
    sortValue: (v) => v.beginn,
    render: (v) => formatDate(v.beginn),
  },
  {
    key: "ende",
    label: "Ende",
    sortValue: (v) => v.ende ?? "9999-12-31",
    render: (v) => formatDate(v.ende),
  },
  {
    key: "kaltmiete",
    label: "Kaltmiete",
    sortValue: (v) => v.kaltmiete,
    render: (v) => formatEuro(v.kaltmiete),
  },
  {
    key: "nk",
    label: "NK-Vorauszahlung",
    sortValue: (v) => v.nebenkostenVorauszahlung,
    render: (v) => formatEuro(v.nebenkostenVorauszahlung),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (v) => statusLabel[v.status],
    searchValue: (v) => statusLabel[v.status],
    render: (v) => (
      <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[v.status]}`}>
        {statusLabel[v.status]}
      </span>
    ),
  },
];

export function MietvertraegeTable({ rows }: { rows: VertragRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Mietverträge angelegt."
      searchPlaceholder="Mietverträge durchsuchen…"
    />
  );
}
