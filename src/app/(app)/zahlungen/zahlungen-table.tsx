"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { RohdatenDialog } from "@/components/rohdaten-dialog";
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
  if (!z.rohdaten) {
    return <span className="text-xs text-neutral-600">manuell</span>;
  }
  return (
    <RohdatenDialog
      rohdaten={z.rohdaten}
      downloadHref={z.importBatchId ? `/api/import-batches/${z.importBatchId}/download` : undefined}
      downloadLabel={`Originaldatei herunterladen${z.importDateiname ? ` (${z.importDateiname})` : ""}`}
    />
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
