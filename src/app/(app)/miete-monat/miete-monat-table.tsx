"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type MieteMonatRow = {
  id: string;
  einheit: string;
  einheitRang: number;
  mieter: string;
  zahlungsweg: string;
  faelligAm: string;
  soll: number;
  ist: number;
  offen: number;
  status: "bezahlt" | "teilweise" | "offen" | "nichtFaellig";
};

const STATUS_TEXT: Record<MieteMonatRow["status"], string> = {
  bezahlt: "Bezahlt",
  teilweise: "Teilweise bezahlt",
  offen: "Nicht bezahlt",
  nichtFaellig: "Noch nicht fällig",
};

const STATUS_KLASSE: Record<MieteMonatRow["status"], string> = {
  bezahlt: "text-green-400",
  teilweise: "text-amber-400",
  offen: "text-red-400",
  nichtFaellig: "text-neutral-400",
};

const columns: Column<MieteMonatRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (z) => z.einheitRang,
    searchValue: (z) => z.einheit,
    render: (z) => (
      <Link prefetch={false} href={`/mietvertraege/${z.id}`} className="font-medium hover:underline">
        {z.einheit}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    className: "max-w-[160px]",
    sortValue: (z) => z.mieter,
    searchValue: (z) => z.mieter,
    render: (z) => <div className="whitespace-normal break-words">{z.mieter}</div>,
  },
  {
    key: "zahlungsweg",
    label: "Zahlungsweg",
    sortValue: (z) => z.zahlungsweg,
    searchValue: (z) => z.zahlungsweg,
    render: (z) => <span className="text-neutral-400">{z.zahlungsweg || "–"}</span>,
  },
  {
    key: "faellig",
    label: "Fällig am",
    render: (z) => <span className="text-neutral-400">{z.faelligAm}</span>,
  },
  { key: "soll", label: "Soll", sortValue: (z) => z.soll, render: (z) => formatEuro(z.soll) },
  { key: "ist", label: "Gezahlt", sortValue: (z) => z.ist, render: (z) => formatEuro(z.ist) },
  {
    key: "offen",
    label: "Offen",
    sortValue: (z) => z.offen,
    render: (z) => (
      <span className={`font-medium ${z.offen > 0 ? "text-red-400" : z.offen < 0 ? "text-green-400" : "text-white"}`}>
        {formatEuro(z.offen)}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (z) => z.status,
    searchValue: (z) => STATUS_TEXT[z.status],
    render: (z) => <span className={STATUS_KLASSE[z.status]}>{STATUS_TEXT[z.status]}</span>,
  },
];

export function MieteMonatTable({ rows }: { rows: MieteMonatRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Alle Mieten für diesen Monat sind bezahlt."
      searchPlaceholder="Mieter oder Einheit suchen…"
    />
  );
}
