"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

const typLabel: Record<string, string> = {
  WOHNUNG: "Wohnung",
  GARAGE: "Garage",
};

export type EinheitRow = {
  id: string;
  gebaeudeId: string;
  gebaeudeStrasse: string;
  gebaeudeHausnummer: string;
  bezeichnung: string;
  typ: "WOHNUNG" | "GARAGE";
  etage: string;
  wohnflaecheQm: number;
  mietvertraege: { id: string; mieter: { id: string; vorname: string; nachname: string }[] }[];
};

function mieterText(e: EinheitRow): string {
  return e.mietvertraege
    .flatMap((v) => v.mieter.map((m) => `${m.vorname} ${m.nachname}`))
    .join(", ");
}

const columns: Column<EinheitRow>[] = [
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (e) => `${e.gebaeudeStrasse} ${e.gebaeudeHausnummer.padStart(4, "0")}`,
    searchValue: (e) => `${e.gebaeudeStrasse} ${e.gebaeudeHausnummer}`,
    render: (e) => (
      <Link href={`/gebaeude/${e.gebaeudeId}`} className="hover:underline">
        {e.gebaeudeStrasse} {e.gebaeudeHausnummer}
      </Link>
    ),
  },
  {
    key: "bezeichnung",
    label: "Bezeichnung",
    sortValue: (e) => e.bezeichnung,
    searchValue: (e) => e.bezeichnung,
    render: (e) => (
      <Link href={`/einheiten/${e.id}`} className="font-medium hover:underline">
        {e.bezeichnung}
      </Link>
    ),
  },
  {
    key: "typ",
    label: "Typ",
    sortValue: (e) => typLabel[e.typ],
    searchValue: (e) => typLabel[e.typ],
    render: (e) => typLabel[e.typ],
  },
  {
    key: "etage",
    label: "Etage",
    sortValue: (e) => e.etage || "",
    searchValue: (e) => e.etage || "",
    render: (e) => e.etage || "–",
  },
  {
    key: "wohnflaeche",
    label: "Wohnfläche",
    sortValue: (e) => e.wohnflaecheQm,
    render: (e) => `${e.wohnflaecheQm.toFixed(2)} m²`,
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (e) => mieterText(e),
    searchValue: (e) => mieterText(e),
    render: (e) =>
      e.mietvertraege.length > 0 ? (
        e.mietvertraege.map((v, vi) => (
          <span key={v.id}>
            {vi > 0 && ", "}
            {v.mieter.map((m, mi) => (
              <span key={m.id}>
                {mi > 0 && " & "}
                <Link href={`/mieter/${m.id}`} className="hover:underline">
                  {m.vorname} {m.nachname}
                </Link>
              </span>
            ))}
          </span>
        ))
      ) : (
        <span className="text-neutral-500">leer</span>
      ),
  },
];

export function EinheitenTable({ rows }: { rows: EinheitRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Einheiten angelegt."
      searchPlaceholder="Einheiten durchsuchen…"
    />
  );
}
