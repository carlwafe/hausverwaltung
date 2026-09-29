"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

export type DienstleisterRow = {
  id: string;
  name: string;
  suchbegriffe: string;
  kostenarten: string;
  gebaeude: string;
  aktiv: boolean;
};

const columns: Column<DienstleisterRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (d) => d.name,
    searchValue: (d) => `${d.name} ${d.suchbegriffe}`,
    render: (d) => (
      <Link href={`/dienstleister/${d.id}`} className="font-medium hover:underline">
        {d.name}
      </Link>
    ),
  },
  {
    key: "suchbegriffe",
    label: "Suchbegriffe",
    sortValue: (d) => d.suchbegriffe,
    render: (d) => d.suchbegriffe.split("\n").join(", "),
  },
  {
    key: "kostenarten",
    label: "Kostenarten",
    sortValue: (d) => d.kostenarten,
    searchValue: (d) => d.kostenarten,
    render: (d) => d.kostenarten || "–",
  },
  { key: "gebaeude", label: "Gebäude", sortValue: (d) => d.gebaeude, render: (d) => d.gebaeude },
  {
    key: "aktiv",
    label: "Auto-Zuordnung",
    sortValue: (d) => (d.aktiv ? 1 : 0),
    render: (d) =>
      d.aktiv ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Aktiv</span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Aus</span>
      ),
  },
];

export function DienstleisterTable({ rows }: { rows: DienstleisterRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Dienstleister angelegt."
      searchPlaceholder="Dienstleister durchsuchen…"
    />
  );
}
