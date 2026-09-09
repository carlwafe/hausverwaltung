"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { deleteSonstigeBuchungen } from "./actions";
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

export type SonstigeBuchungRow = {
  id: string;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  mietvertragId: string | null;
  einheitBezeichnung: string | null;
  mieterNamen: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

const columns: Column<SonstigeBuchungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (b) => b.datum,
    render: (b) => formatDate(b.datum),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (b) => b.betrag,
    render: (b) => (
      <span className={b.betrag < 0 ? "text-red-400" : "text-green-400"}>{formatEuro(b.betrag)}</span>
    ),
  },
  {
    key: "mietvertrag",
    label: "Mietvertrag",
    sortValue: (b) => b.mieterNamen ?? "",
    searchValue: (b) => `${b.mieterNamen ?? ""} ${b.einheitBezeichnung ?? ""}`,
    render: (b) =>
      b.mietvertragId ? (
        <Link href={`/mietvertraege/${b.mietvertragId}`} className="font-medium hover:underline">
          {b.einheitBezeichnung} – {b.mieterNamen}
        </Link>
      ) : (
        <span className="text-neutral-500">–</span>
      ),
  },
  {
    key: "empfaenger",
    label: "Empfänger/Absender",
    sortValue: (b) => b.empfaenger ?? "",
    searchValue: (b) => b.empfaenger ?? "",
    render: (b) => b.empfaenger || "–",
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (b) => b.verwendungszweck ?? "",
    searchValue: (b) => b.verwendungszweck ?? "",
    render: (b) => b.verwendungszweck || "–",
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (b, { expanded, toggleExpanded }) =>
      b.rohdaten ? (
        <RohdatenToggleButton expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span className="text-xs text-neutral-600">manuell</span>
      ),
  },
];

const csvSpalten: CsvSpalte<SonstigeBuchungRow>[] = [
  { label: "Datum", wert: (b) => formatDatumFuerCsv(b.datum) },
  { label: "Betrag", wert: (b) => formatEuroFuerCsv(b.betrag) },
  {
    label: "Mietvertrag",
    wert: (b) => (b.mietvertragId ? `${b.einheitBezeichnung ?? ""} – ${b.mieterNamen ?? ""}` : ""),
  },
  { label: "Empfänger/Absender", wert: (b) => b.empfaenger ?? "" },
  { label: "Verwendungszweck", wert: (b) => b.verwendungszweck ?? "" },
];

export function SonstigeBuchungenTable({ rows }: { rows: SonstigeBuchungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<SonstigeBuchungRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Buchung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      await deleteSonstigeBuchungen(ausgewaehlt.map((r) => r.id));
      setAusgewaehlt([]);
    });
  }

  function exportieren() {
    exportiereAlsCsv(`sonstige-buchungen-${heutigesDatumFuerDateiname()}.csv`, csvSpalten, ausgewaehlt);
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
        emptyMessage="Noch keine sonstigen Buchungen erfasst."
        searchPlaceholder="Sonstige Buchungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        renderExpanded={(b, colSpan) =>
          b.rohdaten ? (
            <RohdatenZeile
              rohdaten={b.rohdaten}
              colSpan={colSpan}
              downloadHref={b.importBatchId ? `/api/import-batches/${b.importBatchId}/download` : undefined}
              downloadLabel={`Originaldatei herunterladen${b.importDateiname ? ` (${b.importDateiname})` : ""}`}
            />
          ) : null
        }
      />
    </div>
  );
}
