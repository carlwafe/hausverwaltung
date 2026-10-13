"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { einheitSortSchluessel } from "@/lib/einheit-sort";

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
  gebaeudeLabel: string;
  gebaeudeHref: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  beginn: string | null;
  ende: string | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
  status: "AKTIV" | "GEPLANT" | "BEENDET";
};

const columns: Column<VertragRow>[] = [
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (v) => v.gebaeudeLabel,
    searchValue: (v) => v.gebaeudeLabel,
    render: (v) => (
      <Link href={v.gebaeudeHref} className="hover:underline">
        {v.gebaeudeLabel}
      </Link>
    ),
  },
  {
    key: "einheit",
    label: "Einheit",
    // Numerisch statt alphabetisch, damit "HS 9" vor "HS 15" einsortiert wird (siehe
    // einheitSortSchluessel) — ein reiner Text-Sort würde die Reihenfolge sonst verfälschen.
    sortValue: (v) => {
      const [haus, whg] = einheitSortSchluessel(v.einheitBezeichnung);
      return haus * 100000 + whg;
    },
    searchValue: (v) => v.einheitBezeichnung,
    className: "whitespace-nowrap",
    render: (v) => (
      <Link prefetch={false} href={`/mietvertraege/${v.id}`} className="font-medium hover:underline">
        {v.einheitBezeichnung}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (v) => v.mieterNamen,
    searchValue: (v) => v.mieterNamen,
    className: "max-w-[160px] truncate",
    render: (v) => v.mieterNamen,
  },
  {
    key: "beginn",
    label: "Beginn",
    sortValue: (v) => v.beginn ?? "",
    render: (v) => (v.beginn ? formatDate(v.beginn) : "unbekannt"),
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

type StatusFilter = "ALLE" | VertragRow["status"];

export function MietvertraegeTable({ rows }: { rows: VertragRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALLE");
  const angezeigteRows = statusFilter === "ALLE" ? rows : rows.filter((r) => r.status === statusFilter);

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(["ALLE", "AKTIV", "GEPLANT", "BEENDET"] as const).map((f) => {
          const anzahl = f === "ALLE" ? rows.length : rows.filter((r) => r.status === f).length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                statusFilter === f
                  ? "border-neutral-500 bg-neutral-800 text-white"
                  : "border-neutral-700 text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              {f === "ALLE" ? "Alle" : statusLabel[f]} ({anzahl})
            </button>
          );
        })}
      </div>
      <DataTable
        columns={columns}
        rows={angezeigteRows}
        emptyMessage={
          statusFilter === "ALLE" ? "Noch keine Mietverträge angelegt." : "Keine Mietverträge mit diesem Status."
        }
        searchPlaceholder="Mietverträge durchsuchen…"
      />
    </div>
  );
}
