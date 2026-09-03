"use client";

import Link from "next/link";
import { useRef } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { deleteZahlung } from "./actions";

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

function RohdatenZelle({ z }: { z: ZahlungRow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (!z.rohdaten) {
    return <span className="text-xs text-neutral-600">manuell</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs text-neutral-400 underline hover:text-white"
      >
        Rohdaten
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-0 text-white backdrop:bg-black/60"
      >
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Rohdaten der Buchung</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-neutral-400 hover:text-white"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          {z.importBatchId && (
            <a
              href={`/api/import-batches/${z.importBatchId}/download`}
              className="mb-3 block text-sm text-white underline"
            >
              Originaldatei herunterladen{z.importDateiname ? ` (${z.importDateiname})` : ""}
            </a>
          )}
          <dl className="max-h-[60vh] space-y-2 overflow-y-auto text-xs">
            {Object.entries(z.rohdaten)
              .filter(([, v]) => v)
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-neutral-500">{key}</dt>
                  <dd className="break-words text-neutral-200">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </dialog>
    </>
  );
}

const columns: Column<ZahlungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (z) => z.datum,
    render: (z) => formatDate(z.datum),
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
    render: (z) => <RohdatenZelle z={z} />,
  },
  {
    key: "aktionen",
    label: "",
    align: "right",
    render: (z) => (
      <DeleteButton
        action={deleteZahlung.bind(null, z.id)}
        confirmText="Zahlung wirklich löschen?"
        label="Löschen"
      />
    ),
  },
];

export function ZahlungenTable({ rows }: { rows: ZahlungRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Zahlungen erfasst."
      searchPlaceholder="Zahlungen durchsuchen…"
    />
  );
}
