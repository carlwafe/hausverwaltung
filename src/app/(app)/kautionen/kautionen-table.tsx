"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { KautionBearbeitenDialog } from "./kaution-bearbeiten-dialog";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  ZURUECKGEZAHLT: "Zurückgezahlt",
};

const STATUS_FARBE: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  ZURUECKGEZAHLT: "bg-neutral-800 text-neutral-300",
};

export type KautionRow = {
  id: string;
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  betrag: number;
  anlageform: string;
  zinssatz: number | null;
  einzahlungsdatum: string | null;
  rueckzahlungsdatum: string | null;
  rueckzahlungsbetrag: number | null;
  status: "AKTIV" | "ZURUECKGEZAHLT";
  notizen: string | null;
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
    render: (r) => formatEuro(r.betrag),
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
    key: "einzahlung",
    label: "Einzahlung",
    sortValue: (r) => r.einzahlungsdatum ?? "",
    render: (r) => formatDate(r.einzahlungsdatum),
  },
  {
    key: "rueckzahlung",
    label: "Rückzahlung",
    sortValue: (r) => r.rueckzahlungsdatum ?? "",
    render: (r) =>
      r.rueckzahlungsdatum
        ? `${formatDate(r.rueckzahlungsdatum)}${
            r.rueckzahlungsbetrag !== null ? ` (${formatEuro(r.rueckzahlungsbetrag)})` : ""
          }`
        : "–",
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
  {
    key: "notizen",
    label: "Notizen",
    sortValue: (r) => r.notizen ?? "",
    searchValue: (r) => r.notizen ?? "",
    render: (r) =>
      r.notizen ? (
        <span className="block max-w-[200px] truncate text-neutral-300" title={r.notizen}>
          {r.notizen}
        </span>
      ) : (
        "–"
      ),
  },
  {
    key: "bearbeiten",
    label: "",
    render: (r) => (
      <KautionBearbeitenDialog
        id={r.id}
        status={r.status}
        rueckzahlungsdatum={r.rueckzahlungsdatum}
        rueckzahlungsbetrag={r.rueckzahlungsbetrag}
        notizen={r.notizen}
      />
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
