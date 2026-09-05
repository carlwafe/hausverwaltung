"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenDialog } from "@/components/rohdaten-dialog";
import { deleteKautionsbuchungen } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type KautionsbuchungRow = {
  id: string;
  mietvertragId: string | null;
  einheitBezeichnung: string | null;
  mieterNamen: string | null;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

function RohdatenZelle({ k }: { k: KautionsbuchungRow }) {
  if (!k.rohdaten) {
    return <span className="text-xs text-neutral-600">manuell</span>;
  }
  return (
    <RohdatenDialog
      rohdaten={k.rohdaten}
      downloadHref={k.importBatchId ? `/api/import-batches/${k.importBatchId}/download` : undefined}
      downloadLabel={`Originaldatei herunterladen${k.importDateiname ? ` (${k.importDateiname})` : ""}`}
    />
  );
}

const columns: Column<KautionsbuchungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum,
    render: (k) => formatDate(k.datum),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (k) => k.betrag,
    render: (k) => formatEuro(k.betrag),
  },
  {
    key: "mietvertrag",
    label: "Mietvertrag",
    sortValue: (k) => k.mieterNamen ?? "",
    searchValue: (k) => k.mieterNamen ?? "",
    render: (k) =>
      k.mietvertragId ? (
        <Link href={`/mietvertraege/${k.mietvertragId}`} className="hover:underline">
          {k.einheitBezeichnung} — {k.mieterNamen}
        </Link>
      ) : (
        <span className="text-neutral-500">nicht zugeordnet</span>
      ),
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (k) => k.verwendungszweck ?? "",
    searchValue: (k) => k.verwendungszweck ?? "",
    render: (k) => k.verwendungszweck || "–",
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (k) => <RohdatenZelle k={k} />,
  },
];

export function KautionsbuchungenTable({ rows }: { rows: KautionsbuchungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<KautionsbuchungRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Buchung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      await deleteKautionsbuchungen(ausgewaehlt.map((r) => r.id));
      setAusgewaehlt([]);
    });
  }

  return (
    <div>
      {ausgewaehlt.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
          <span className="text-sm text-neutral-300">{ausgewaehlt.length} ausgewählt</span>
          <button
            type="button"
            onClick={loeschen}
            disabled={pending}
            className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
          >
            {pending ? "Lösche…" : "Ausgewählte löschen"}
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Noch keine Kautionsbuchungen aus Kontoauszug importiert."
        searchPlaceholder="Kautionsbuchungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
      />
    </div>
  );
}
