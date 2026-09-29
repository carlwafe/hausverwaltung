"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type DienstleisterRow = {
  id: string;
  name: string;
  beschreibung: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  // Nur für die Suche, nicht als Spalte sichtbar.
  suchbegriffe: string;
  kostenarten: string;
  adresse: string;
};

const columns: Column<DienstleisterRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (d) => d.name,
    searchValue: (d) => `${d.name} ${d.suchbegriffe} ${d.kostenarten} ${d.adresse}`,
    render: (d) => (
      <Link href={`/dienstleister/${d.id}`} className="font-medium hover:underline">
        {d.name}
      </Link>
    ),
  },
  {
    key: "beschreibung",
    label: "Beschreibung",
    sortValue: (d) => d.beschreibung,
    searchValue: (d) => d.beschreibung,
    render: (d) => d.beschreibung || "–",
  },
  {
    key: "ansprechpartner",
    label: "Ansprechpartner",
    sortValue: (d) => d.ansprechpartner,
    searchValue: (d) => d.ansprechpartner,
    render: (d) => d.ansprechpartner || "–",
  },
  {
    key: "telefon",
    label: "Telefon",
    sortValue: (d) => d.telefon,
    searchValue: (d) => d.telefon,
    render: (d) =>
      d.telefon ? (
        <a href={`tel:${d.telefon.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap hover:underline">
          {d.telefon}
        </a>
      ) : (
        "–"
      ),
  },
  {
    key: "email",
    label: "E-Mail",
    sortValue: (d) => d.email,
    searchValue: (d) => d.email,
    render: (d) =>
      d.email ? (
        <a href={`mailto:${d.email}`} className="hover:underline">
          {d.email}
        </a>
      ) : (
        "–"
      ),
  },
];

export function DienstleisterTable({ rows }: { rows: DienstleisterRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch nichts angelegt."
      searchPlaceholder="Name, Beschreibung, Telefon … durchsuchen"
    />
  );
}
