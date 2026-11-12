"use client";

import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { KarteKopf, KarteMeta } from "@/components/karte";

export type GebaeudeRow = {
  id: string;
  strasse: string;
  haus: string | null;
  hausId: string | null;
  hausnummer: string;
  einheitenCount: number;
};

const columns: Column<GebaeudeRow>[] = [
  {
    key: "strasse",
    label: "Straße",
    sortValue: (g) => g.strasse,
    searchValue: (g) => g.strasse,
    render: (g) => (
      <Link prefetch={false} href={`/gebaeude/${g.id}`} className={TABELLEN_LINK}>
        {g.strasse}
      </Link>
    ),
  },
  {
    key: "hausnummer",
    label: "Hausnummer",
    sortValue: (g) => (Number.isNaN(Number(g.hausnummer)) ? g.hausnummer : Number(g.hausnummer)),
    searchValue: (g) => g.hausnummer,
    render: (g) => g.hausnummer,
  },
  {
    key: "haus",
    label: "Haus",
    sortValue: (g) => g.haus ?? "",
    searchValue: (g) => g.haus ?? "",
    render: (g) =>
      g.haus && g.hausId ? (
        <Link prefetch={false} href={`/haeuser/${g.hausId}`} className="hover:underline">
          {g.haus}
        </Link>
      ) : (
        "–"
      ),
  },
  {
    key: "einheiten",
    label: "Einheiten",
    sortValue: (g) => g.einheitenCount,
    render: (g) => g.einheitenCount,
  },
];

export function GebaeudeTable({ rows }: { rows: GebaeudeRow[] }) {
  return (
    <DataTable
      rowHref={(g) => `/gebaeude/${g.id}`}
      mobileCard={(g) => (
        <>
          <KarteKopf
            titel={`${g.strasse} ${g.hausnummer}`}
            wert={`${g.einheitenCount} ${g.einheitenCount === 1 ? "Einheit" : "Einheiten"}`}
            wertKlasse="text-neutral-300"
          />
          {g.haus && <KarteMeta>{g.haus}</KarteMeta>}
        </>
      )}
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Gebäude angelegt."
      searchPlaceholder="Gebäude durchsuchen…"
    />
  );
}
