"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

const VERTEILERSCHLUESSEL_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
  PERSONENZAHL: "Personenzahl",
  EINHEITEN: "Anzahl Einheiten",
  VERBRAUCH_MANUELL: "Verbrauch (manuell)",
  VORVERTEILT: "Extern vorverteilt",
};

export type KostenartRow = {
  id: string;
  name: string;
  umlagefaehig: boolean;
  standardVerteilerschluessel: string | null;
  anzahlPositionen: number;
};

const columns: Column<KostenartRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (k) => k.name,
    searchValue: (k) => k.name,
    render: (k) => (
      <Link href={`/kostenarten/${k.id}`} className="font-medium hover:underline">
        {k.name}
      </Link>
    ),
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
    key: "verteilerschluessel",
    label: "Standard-Verteilerschlüssel",
    sortValue: (k) => (k.standardVerteilerschluessel ? VERTEILERSCHLUESSEL_LABEL[k.standardVerteilerschluessel] : ""),
    render: (k) =>
      k.standardVerteilerschluessel ? VERTEILERSCHLUESSEL_LABEL[k.standardVerteilerschluessel] : "–",
  },
  {
    key: "positionen",
    label: "Kostenpositionen",
    sortValue: (k) => k.anzahlPositionen,
    render: (k) => k.anzahlPositionen,
  },
];

export function KostenartenTable({ rows }: { rows: KostenartRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kostenarten angelegt."
      searchPlaceholder="Kostenarten durchsuchen…"
    />
  );
}
