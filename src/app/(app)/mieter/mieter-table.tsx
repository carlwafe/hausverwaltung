"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type MieterRow = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  handynummer: string | null;
  festnetznummer: string | null;
  einheiten: string[];
};

const columns: Column<MieterRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (m) => `${m.nachname} ${m.vorname}`,
    searchValue: (m) => `${m.vorname} ${m.nachname}`,
    render: (m) => (
      <Link href={`/mieter/${m.id}`} className="font-medium hover:underline">
        {m.vorname} {m.nachname}
      </Link>
    ),
  },
  {
    key: "email",
    label: "E-Mail",
    sortValue: (m) => m.email ?? "",
    searchValue: (m) => m.email ?? "",
    render: (m) => m.email ?? "–",
  },
  {
    key: "handy",
    label: "Handy",
    sortValue: (m) => m.handynummer ?? "",
    searchValue: (m) => m.handynummer ?? "",
    render: (m) => m.handynummer ?? "–",
  },
  {
    key: "festnetz",
    label: "Festnetz",
    sortValue: (m) => m.festnetznummer ?? "",
    searchValue: (m) => m.festnetznummer ?? "",
    render: (m) => m.festnetznummer ?? "–",
  },
  {
    key: "einheiten",
    label: "Einheit(en)",
    sortValue: (m) => m.einheiten.join(", "),
    searchValue: (m) => m.einheiten.join(", "),
    render: (m) => m.einheiten.join(", ") || "–",
  },
];

export function MieterTable({ rows }: { rows: MieterRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Mieter angelegt."
      searchPlaceholder="Mieter durchsuchen…"
    />
  );
}
