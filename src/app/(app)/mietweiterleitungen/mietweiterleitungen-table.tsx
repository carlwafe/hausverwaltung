"use client";

import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenDialog } from "@/components/rohdaten-dialog";
import { deleteMietweiterleitungen } from "./actions";
import {
  exportiereAlsCsv,
  formatDatumFuerCsv,
  formatEuroFuerCsv,
  heutigesDatumFuerDateiname,
  type CsvSpalte,
} from "@/lib/export-csv";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type MietweiterleitungRow = {
  id: string;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

function RohdatenZelle({ m }: { m: MietweiterleitungRow }) {
  if (!m.rohdaten) {
    return <span className="text-xs text-neutral-600">manuell</span>;
  }
  return (
    <RohdatenDialog
      rohdaten={m.rohdaten}
      downloadHref={m.importBatchId ? `/api/import-batches/${m.importBatchId}/download` : undefined}
      downloadLabel={`Originaldatei herunterladen${m.importDateiname ? ` (${m.importDateiname})` : ""}`}
    />
  );
}

const columns: Column<MietweiterleitungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (m) => m.datum,
    render: (m) => formatDate(m.datum),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (m) => m.betrag,
    render: (m) => (
      <span className={m.betrag < 0 ? "text-red-400" : "text-green-400"}>{formatEuro(m.betrag)}</span>
    ),
  },
  {
    key: "richtung",
    label: "Richtung",
    render: (m) =>
      m.betrag < 0 ? (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
          Mietweiterleitung
        </span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Einlage</span>
      ),
  },
  {
    key: "empfaenger",
    label: "Empfänger/Absender",
    sortValue: (m) => m.empfaenger ?? "",
    searchValue: (m) => m.empfaenger ?? "",
    render: (m) => m.empfaenger || "–",
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (m) => m.verwendungszweck ?? "",
    searchValue: (m) => m.verwendungszweck ?? "",
    render: (m) => m.verwendungszweck || "–",
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (m) => <RohdatenZelle m={m} />,
  },
];

const csvSpalten: CsvSpalte<MietweiterleitungRow>[] = [
  { label: "Datum", wert: (m) => formatDatumFuerCsv(m.datum) },
  { label: "Betrag", wert: (m) => formatEuroFuerCsv(m.betrag) },
  { label: "Richtung", wert: (m) => (m.betrag < 0 ? "Mietweiterleitung" : "Einlage") },
  { label: "Empfänger/Absender", wert: (m) => m.empfaenger ?? "" },
  { label: "Verwendungszweck", wert: (m) => m.verwendungszweck ?? "" },
];

export function MietweiterleitungenTable({ rows }: { rows: MietweiterleitungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<MietweiterleitungRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Buchung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      await deleteMietweiterleitungen(ausgewaehlt.map((r) => r.id));
      setAusgewaehlt([]);
    });
  }

  function exportieren() {
    exportiereAlsCsv(`mietweiterleitungen-${heutigesDatumFuerDateiname()}.csv`, csvSpalten, ausgewaehlt);
  }

  return (
    <div>
      {ausgewaehlt.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
          <span className="text-sm text-neutral-300">{ausgewaehlt.length} ausgewählt</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportieren}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
            >
              Ausgewählte als CSV exportieren
            </button>
            <button
              type="button"
              onClick={loeschen}
              disabled={pending}
              className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
            >
              {pending ? "Lösche…" : "Ausgewählte löschen"}
            </button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Noch keine Mietweiterleitungen erfasst."
        searchPlaceholder="Mietweiterleitungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
      />
    </div>
  );
}
