"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { deleteZahlungen } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

const MONATE_KURZ = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

export type ZahlungRow = {
  id: string;
  mietvertragId: string;
  datum: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  periodeMonat: number;
  periodeJahr: number;
  betrag: number;
  verwendungszweck: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

const columns: Column<ZahlungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (z) => z.datum,
    render: (z) => (
      <Link href={`/zahlungen/${z.id}`} className="font-medium hover:underline">
        {formatDate(z.datum)}
      </Link>
    ),
  },
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (z) => z.einheitBezeichnung,
    searchValue: (z) => z.einheitBezeichnung,
    render: (z) => (
      <Link href={`/mietvertraege/${z.mietvertragId}`} className="font-medium hover:underline">
        {z.einheitBezeichnung}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (z) => z.mieterNamen,
    searchValue: (z) => z.mieterNamen,
    render: (z) => z.mieterNamen,
  },
  {
    key: "periode",
    label: "Für Periode",
    sortValue: (z) => z.periodeJahr * 12 + z.periodeMonat,
    render: (z) => `${MONATE_KURZ[z.periodeMonat - 1]} ${z.periodeJahr}`,
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (z) => z.betrag,
    render: (z) => formatEuro(z.betrag),
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (z) => z.verwendungszweck ?? "",
    searchValue: (z) => z.verwendungszweck ?? "",
    render: (z) => z.verwendungszweck || "–",
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (z, { expanded, toggleExpanded }) =>
      z.rohdaten ? (
        <RohdatenToggleButton expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span className="text-xs text-neutral-600">manuell</span>
      ),
  },
];

export function ZahlungenTable({ rows }: { rows: ZahlungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<ZahlungRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Zahlung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      await deleteZahlungen(ausgewaehlt.map((r) => r.id));
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
        emptyMessage="Noch keine Zahlungen erfasst."
        searchPlaceholder="Zahlungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        renderExpanded={(z, colSpan) =>
          z.rohdaten ? (
            <RohdatenZeile
              rohdaten={z.rohdaten}
              colSpan={colSpan}
              downloadHref={z.importBatchId ? `/api/import-batches/${z.importBatchId}/download` : undefined}
              downloadLabel={`Originaldatei herunterladen${z.importDateiname ? ` (${z.importDateiname})` : ""}`}
            />
          ) : null
        }
      />
    </div>
  );
}
