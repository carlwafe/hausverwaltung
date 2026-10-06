"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { TICKET_KATEGORIE, TICKET_PRIORITAET, TICKET_STATUS } from "@/lib/ticket";

export type TicketRow = {
  id: string;
  nummer: number;
  titel: string;
  kategorie: string;
  status: string;
  prioritaet: string;
  // ISO-Datum (yyyy-mm-dd) oder null
  faelligAm: string | null;
  ueberfaellig: boolean;
  bezug: string;
  zustaendig: string;
};

const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));

const badge = "rounded-full px-2 py-0.5 text-xs whitespace-nowrap";

const columns: Column<TicketRow>[] = [
  {
    key: "nummer",
    label: "Nr.",
    sortValue: (t) => t.nummer,
    searchValue: (t) => `#${t.nummer}`,
    render: (t) => <span className="text-neutral-400">#{t.nummer}</span>,
  },
  {
    key: "titel",
    label: "Titel",
    sortValue: (t) => t.titel,
    searchValue: (t) => t.titel,
    render: (t) => (
      <Link prefetch={false} href={`/tickets/${t.id}`} className="font-medium hover:underline">
        {t.titel}
      </Link>
    ),
  },
  {
    key: "kategorie",
    label: "Kategorie",
    sortValue: (t) => t.kategorie,
    render: (t) => TICKET_KATEGORIE.find((k) => k.value === t.kategorie)?.label ?? t.kategorie,
  },
  {
    key: "bezug",
    label: "Bezug",
    sortValue: (t) => t.bezug,
    searchValue: (t) => t.bezug,
    render: (t) => t.bezug || "–",
  },
  {
    key: "status",
    label: "Status",
    sortValue: (t) => TICKET_STATUS.findIndex((s) => s.value === t.status),
    render: (t) => {
      const s = TICKET_STATUS.find((x) => x.value === t.status);
      return <span className={`${badge} ${s?.farbe ?? ""}`}>{s?.label ?? t.status}</span>;
    },
  },
  {
    key: "prioritaet",
    label: "Priorität",
    sortValue: (t) => TICKET_PRIORITAET.findIndex((p) => p.value === t.prioritaet),
    render: (t) => {
      const p = TICKET_PRIORITAET.find((x) => x.value === t.prioritaet);
      return <span className={`${badge} ${p?.farbe ?? ""}`}>{p?.label ?? t.prioritaet}</span>;
    },
  },
  {
    key: "faelligAm",
    label: "Fällig",
    sortValue: (t) => t.faelligAm ?? "9999-12-31",
    render: (t) =>
      t.faelligAm ? (
        <span className={t.ueberfaellig ? "font-medium text-red-400" : ""}>
          {formatDate(t.faelligAm)}
          {t.ueberfaellig && " (überfällig)"}
        </span>
      ) : (
        "–"
      ),
  },
  {
    key: "zustaendig",
    label: "Zuständig",
    sortValue: (t) => t.zustaendig,
    searchValue: (t) => t.zustaendig,
    render: (t) => t.zustaendig || "–",
  },
];

export function TicketTable({ rows }: { rows: TicketRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Keine Tickets."
      searchPlaceholder="Tickets durchsuchen…"
      selectFilter={{
        label: "Kategorie",
        value: (t) => t.kategorie,
        options: TICKET_KATEGORIE.map((k) => ({ value: k.value, label: k.label })),
        placeholder: "Alle Kategorien",
      }}
    />
  );
}
