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
  aktuelleKalt: number;
  basisMonat: string; // MM/JJJJ des Basisindex
  basisIndex: number | null;
  neuerMonat: string | null;
  neuerIndex: number | null;
  aenderungProzent: number | null;
  neueKalt: number | null;
};

const euro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zahl = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const leer = <span className="text-neutral-600">–</span>;

const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));

const columns: Column<ErhoehungZeile>[] = [
  {
    key: "einheit",
    label: "Einheit",
    render: (z) => (
      <Link prefetch={false} href={`/mietvertraege/${z.id}`} className="font-medium text-white hover:underline">
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
    key: "schreiben",
    label: "Schreiben",
    render: (z) => (
      <Link
        href={`/mietvertraege/${z.id}/indexerhoehung`}
        prefetch={false}
        className="inline-block whitespace-nowrap rounded-md border border-neutral-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
      >
        Erstellen
      </Link>
    ),
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
  {
    key: "kalt",
    label: "Kaltmiete jetzt",
    align: "right",
    render: (z) => <span className="text-neutral-300">{euro(z.aktuelleKalt)} €</span>,
    sortValue: (z) => z.aktuelleKalt,
  },
  {
    key: "basis",
    label: "Basisindex",
    align: "right",
    title: "Bei der letzten Erhöhung zugrunde gelegter Index (falls erfasst), sonst VPI des Monats der letzten Kaltmieten-Änderung bzw. des Mietbeginns",
    render: (z) =>
      z.basisIndex === null ? (
        <span title="Kein VPI-Wert für diesen Monat eingetragen">{leer}</span>
      ) : (
        <span className="text-neutral-300">
          {zahl(z.basisIndex)} <span className="text-xs text-neutral-500">({z.basisMonat})</span>
        </span>
      ),
    sortValue: (z) => z.basisIndex ?? -1,
  },
  {
    key: "neuerIndex",
    label: "Neuer Index",
    align: "right",
    title: "Neuester eingetragener VPI",
    render: (z) =>
      z.neuerIndex === null ? (
        leer
      ) : (
        <span className="text-neutral-300">
          {zahl(z.neuerIndex)} <span className="text-xs text-neutral-500">({z.neuerMonat})</span>
        </span>
      ),
    sortValue: (z) => z.neuerIndex ?? -1,
  },
  {
    key: "aenderung",
    label: "Änderung",
    align: "right",
    render: (z) => (z.aenderungProzent === null ? leer : <span className="text-white">{euro(z.aenderungProzent)} %</span>),
    sortValue: (z) => z.aenderungProzent ?? -999,
  },
  {
    key: "neueKalt",
    label: "Neue Kaltmiete",
    align: "right",
    title: "Kaltmiete jetzt × neuer Index ÷ Basisindex, auf volle Euro abgerundet (Vorschau, nicht gespeichert)",
    render: (z) =>
      z.neueKalt === null ? (
        leer
      ) : (
        <span className="text-white">
          {euro(z.neueKalt)} € <span className="text-xs text-neutral-500">(+{euro(z.neueKalt - z.aktuelleKalt)})</span>
        </span>
      ),
    sortValue: (z) => z.neueKalt ?? -1,
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
