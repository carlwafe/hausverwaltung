"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type ErhoehungZeile = {
  id: string; // Mietvertrag-ID
  einheitBezeichnung: string;
  einheitRang: number;
  mieterNamen: string;
  referenzDatum: string; // ISO
  referenzQuelle: "Mietbeginn" | "letzte Mieterhöhung";
  naechsteMoeglich: string; // ISO
  bereitsMoeglich: boolean;
  monateBis: number;
};

const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));

const columns: Column<ErhoehungZeile>[] = [
  {
    key: "einheit",
    label: "Einheit",
    render: (z) => (
      <Link href={`/mietvertraege/${z.id}`} className="font-medium text-white hover:underline">
        {z.einheitBezeichnung}
      </Link>
    ),
    sortValue: (z) => z.einheitRang,
    searchValue: (z) => z.einheitBezeichnung,
  },
  {
    key: "mieter",
    label: "Mieter",
    render: (z) => <span className="text-neutral-300">{z.mieterNamen}</span>,
    sortValue: (z) => z.mieterNamen,
    searchValue: (z) => z.mieterNamen,
  },
  {
    key: "letzte",
    label: "Letzte Anpassung",
    render: (z) => (
      <span className="text-neutral-300">
        {formatDate(z.referenzDatum)} <span className="text-xs text-neutral-500">({z.referenzQuelle})</span>
      </span>
    ),
    sortValue: (z) => z.referenzDatum,
  },
  {
    key: "moeglichAb",
    label: "Mieterhöhung möglich ab",
    render: (z) => <span className="text-white">{formatDate(z.naechsteMoeglich)}</span>,
    sortValue: (z) => z.naechsteMoeglich,
  },
  {
    key: "status",
    label: "Status",
    render: (z) =>
      z.bereitsMoeglich ? (
        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">jetzt möglich</span>
      ) : (
        <span className="text-xs text-neutral-500">
          noch {z.monateBis} Monat{z.monateBis === 1 ? "" : "e"}
        </span>
      ),
    // Bereits mögliche zuerst (negativ), dann nach Restmonaten
    sortValue: (z) => (z.bereitsMoeglich ? -1 : z.monateBis),
  },
];

export function ErhoehungenTabelle({ rows }: { rows: ErhoehungZeile[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Keine aktiven Mietverträge mit bekanntem Mietbeginn."
      defaultSort={{ key: "moeglichAb" }}
    />
  );
}
