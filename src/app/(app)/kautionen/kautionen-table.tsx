"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

const STATUS_LABEL = {
  AKTIV: "Aktiv",
  AUFGELOEST: "Aufgelöst",
  ERLEDIGT: "Erledigt",
} as const;

const STATUS_FARBE: Record<keyof typeof STATUS_LABEL, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  AUFGELOEST: "bg-amber-500/10 text-amber-400",
  ERLEDIGT: "bg-neutral-800 text-neutral-300",
};

export type KautionRow = {
  id: string;
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  betrag: number;
  // true, wenn es mindestens eine "Einzahlung Mieter"-Kautionsbuchung gibt und ihre Summe
  // (einzahlungSumme) von betrag abweicht.
  betragAbweichung: boolean;
  einzahlungSumme: number | null;
  anlageform: string;
  zinssatz: number | null;
  // Summe der "Auflösung"- bzw. "Auszahlung Mieter"-Kautionsbuchungen dieses Mietvertrags (0,
  // wenn keine vorhanden). einbehalten ist nur gesetzt (nicht null), sobald aufgeloest > 0 ist.
  aufgeloest: number;
  ausgezahlt: number;
  einbehalten: number | null;
  status: keyof typeof STATUS_LABEL;
};

const columns: Column<KautionRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (r) => r.einheitBezeichnung,
    searchValue: (r) => r.einheitBezeichnung,
    render: (r) => (
      <Link href={`/mietvertraege/${r.mietvertragId}`} className="font-medium hover:underline">
        {r.einheitBezeichnung}
      </Link>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (r) => r.mieterNamen,
    searchValue: (r) => r.mieterNamen,
    render: (r) => r.mieterNamen,
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (r) => r.betrag,
    render: (r) => (
      <span className="inline-flex items-center gap-1">
        {formatEuro(r.betrag)}
        {r.betragAbweichung && (
          <span
            title={`Weicht von der Summe der "Einzahlung Mieter"-Kautionsbuchungen ab: ${formatEuro(r.einzahlungSumme!)}`}
            className="text-amber-400"
          >
            ⚠
          </span>
        )}
      </span>
    ),
  },
  {
    key: "anlageform",
    label: "Anlageform",
    sortValue: (r) => ANLAGEFORM_LABEL[r.anlageform],
    searchValue: (r) => ANLAGEFORM_LABEL[r.anlageform],
    render: (r) => ANLAGEFORM_LABEL[r.anlageform],
  },
  {
    key: "zinssatz",
    label: "Zinssatz",
    sortValue: (r) => r.zinssatz ?? -1,
    render: (r) => (r.zinssatz !== null ? `${r.zinssatz.toLocaleString("de-DE")} %` : "–"),
  },
  {
    key: "aufgeloest",
    label: "Aufgelöst",
    sortValue: (r) => r.aufgeloest,
    render: (r) => (r.aufgeloest > 0 ? formatEuro(r.aufgeloest) : "–"),
  },
  {
    key: "ausgezahlt",
    label: "Ausgezahlt",
    sortValue: (r) => r.ausgezahlt,
    render: (r) => (r.ausgezahlt > 0 ? formatEuro(r.ausgezahlt) : "–"),
  },
  {
    key: "einbehalten",
    label: "Einbehalten",
    sortValue: (r) => r.einbehalten ?? -1,
    render: (r) =>
      r.einbehalten === null ? (
        "–"
      ) : (
        <span className={r.einbehalten > 0 ? "text-amber-400" : "text-neutral-400"}>
          {formatEuro(r.einbehalten)}
        </span>
      ),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (r) => STATUS_LABEL[r.status],
    searchValue: (r) => STATUS_LABEL[r.status],
    render: (r) => (
      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[r.status]}`}>
        {STATUS_LABEL[r.status]}
      </span>
    ),
  },
];

export function KautionenTable({ rows }: { rows: KautionRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kautionen erfasst."
      searchPlaceholder="Kautionen durchsuchen…"
    />
  );
}
