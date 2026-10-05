"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { mieterName } from "@/lib/mieter-name";

export type MieterRow = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  handynummer: string | null;
  festnetznummer: string | null;
  buergergeldEmpfaenger: boolean;
  einheiten: string[];
  // Aktiv = mindestens ein laufender Mietvertrag; Geplant = nur künftige; sonst Inaktiv.
  status: "AKTIV" | "GEPLANT" | "INAKTIV";
};

const STATUS_LABEL = { AKTIV: "Aktiv", GEPLANT: "Geplant", INAKTIV: "Inaktiv" } as const;
const STATUS_KLASSE = {
  AKTIV: "bg-emerald-500/15 text-emerald-400",
  GEPLANT: "bg-blue-500/15 text-blue-400",
  INAKTIV: "bg-neutral-700/40 text-neutral-400",
} as const;

const columns: Column<MieterRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (m) => `${m.nachname} ${m.vorname}`,
    searchValue: (m) => mieterName(m),
    render: (m) => (
      <Link href={`/mieter/${m.id}`} className="font-medium hover:underline">
        {mieterName(m)}
      </Link>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (m) => STATUS_LABEL[m.status],
    searchValue: (m) => STATUS_LABEL[m.status],
    render: (m) => (
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_KLASSE[m.status]}`}>
        {STATUS_LABEL[m.status]}
      </span>
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

export function MieterTable({
  rows,
  duplikatIds,
}: {
  rows: MieterRow[];
  duplikatIds: string[];
}) {
  const [nurDuplikate, setNurDuplikate] = useState(false);
  const duplikatSet = new Set(duplikatIds);
  const [statusFilter, setStatusFilter] = useState<"ALLE" | MieterRow["status"]>("ALLE");
  const angezeigteRows = rows
    .filter((r) => !nurDuplikate || duplikatSet.has(r.id))
    .filter((r) => statusFilter === "ALLE" || r.status === statusFilter);

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(["ALLE", "AKTIV", "GEPLANT", "INAKTIV"] as const).map((f) => (
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
            {f === "ALLE" ? "Alle" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {duplikatIds.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setNurDuplikate((v) => !v)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              nurDuplikate
                ? "border-amber-500/60 bg-amber-950/30 text-amber-400"
                : "border-neutral-700 text-white hover:bg-neutral-900"
            }`}
          >
            {nurDuplikate
              ? "Alle Mieter anzeigen"
              : `Mögliche Duplikate anzeigen (${duplikatIds.length})`}
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={angezeigteRows}
        emptyMessage="Noch keine Mieter angelegt."
        searchPlaceholder="Mieter durchsuchen…"
        rowClassName={(m) => (m.buergergeldEmpfaenger ? "bg-blue-500/10" : "")}
      />
    </div>
  );
}
