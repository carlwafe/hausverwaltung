"use client";

import Link from "next/link";
import { useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { deleteMieter } from "./actions";

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
  {
    key: "aktionen",
    label: "",
    align: "right",
    render: (m) => (
      <DeleteButton
        action={deleteMieter.bind(null, m.id)}
        confirmText={
          m.einheiten.length > 0
            ? `${m.vorname} ${m.nachname} wirklich löschen? Die Verknüpfung zu ${m.einheiten.join(", ")} geht dabei verloren (Zahlungen bleiben erhalten).`
            : `${m.vorname} ${m.nachname} wirklich löschen?`
        }
        label="Löschen"
      />
    ),
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
  const angezeigteRows = nurDuplikate ? rows.filter((r) => duplikatSet.has(r.id)) : rows;

  return (
    <div>
      {duplikatIds.length > 0 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setNurDuplikate((v) => !v)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${
              nurDuplikate
                ? "border-amber-700 bg-amber-950/30 text-amber-400"
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
      />
    </div>
  );
}
