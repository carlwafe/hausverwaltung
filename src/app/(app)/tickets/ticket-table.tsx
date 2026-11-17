"use client";

import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
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

// Feste Breiten (im <div> der Zelle) für alle Spalten außer dem Titel: Die beiden Tabellen der Seite
// (Mängel/Sonstiges und Buchhaltung) stehen untereinander, ihre Spalten sollen bündig sein — der Titel nimmt
// als Füllspalte den Rest.
const columns: Column<TicketRow>[] = [
  {
    key: "nummer",
    label: "Nr.",
    sortValue: (t) => t.nummer,
    searchValue: (t) => `#${t.nummer}`,
    render: (t) => <span className="text-neutral-400">#{t.nummer}</span>,
  },
  {
    // Titel und Bezug teilen sich die Füllspalte (Bezug klein darunter): eigene Bezug-Spalte machte die Titel
    // zu schmal und die Zeilen zwei bis drei Textzeilen hoch.
    key: "titel",
    label: "Titel · Bezug",
    title: "Sortiert nach Titel",
    fuellend: true,
    sortValue: (t) => t.titel,
    searchValue: (t) => `${t.titel} ${t.bezug}`,
    render: (t) => (
      <>
        <div className="truncate" title={t.titel}>
          <Link prefetch={false} href={`/tickets/${t.id}`} className={TABELLEN_LINK}>
            {t.titel}
          </Link>
        </div>
        {t.bezug && (
          <div className="truncate text-xs text-neutral-400" title={t.bezug}>
            {t.bezug}
          </div>
        )}
      </>
    ),
  },
  {
    key: "kategorie",
    label: "Kategorie",
    sortValue: (t) => t.kategorie,
    render: (t) => (
      <div className="w-32">{TICKET_KATEGORIE.find((k) => k.value === t.kategorie)?.label ?? t.kategorie}</div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (t) => TICKET_STATUS.findIndex((s) => s.value === t.status),
    render: (t) => {
      const s = TICKET_STATUS.find((x) => x.value === t.status);
      return (
        <div className="w-28">
          <span className={`${badge} ${s?.farbe ?? ""}`}>{s?.label ?? t.status}</span>
        </div>
      );
    },
  },
  {
    // Fast alle Tickets sind „Normal“ — das Kennzeichen steht nur, wenn die Priorität davon abweicht.
    key: "prioritaet",
    label: "Prio",
    title: "Priorität — „Normal“ wird nicht angezeigt",
    sortValue: (t) => TICKET_PRIORITAET.findIndex((p) => p.value === t.prioritaet),
    render: (t) => {
      const p = TICKET_PRIORITAET.find((x) => x.value === t.prioritaet);
      return (
        <div className="w-20">
          {t.prioritaet !== "NORMAL" && <span className={`${badge} ${p?.farbe ?? ""}`}>{p?.label ?? t.prioritaet}</span>}
        </div>
      );
    },
  },
  {
    key: "faelligAm",
    label: "Fällig",
    sortValue: (t) => t.faelligAm ?? "9999-12-31",
    render: (t) => (
      <div className="w-24 whitespace-nowrap">
        {t.faelligAm ? (
          <span className={t.ueberfaellig ? "font-medium text-red-400" : ""}>
            {formatDate(t.faelligAm)}
            {t.ueberfaellig && <span className="block text-xs font-normal">überfällig</span>}
          </span>
        ) : (
          <span className="text-neutral-500">–</span>
        )}
      </div>
    ),
  },
  {
    key: "zustaendig",
    label: "Zuständig",
    sortValue: (t) => t.zustaendig,
    searchValue: (t) => t.zustaendig,
    render: (t) => (
      <div className="w-28 truncate" title={t.zustaendig || undefined}>
        {t.zustaendig || <span className="text-neutral-500">–</span>}
      </div>
    ),
  },
];

// Karte fürs Handy (unter md statt der Tabellenzeile, siehe `mobileCard` an DataTable): Titel groß,
// darunter Status/Priorität/Fälligkeit, dann Bezug und klein Kategorie/Zuständigkeit.
function TicketKarte({ t, mitKategorie }: { t: TicketRow; mitKategorie: boolean }) {
  const s = TICKET_STATUS.find((x) => x.value === t.status);
  const p = TICKET_PRIORITAET.find((x) => x.value === t.prioritaet);
  const kategorie = TICKET_KATEGORIE.find((k) => k.value === t.kategorie)?.label ?? t.kategorie;
  const fuss = [mitKategorie ? kategorie : null, t.zustaendig ? `zuständig: ${t.zustaendig}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-base font-medium leading-snug text-white">{t.titel}</span>
        <span className="shrink-0 text-sm text-neutral-500">#{t.nummer}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`${badge} ${s?.farbe ?? ""}`}>{s?.label ?? t.status}</span>
        <span className={`${badge} ${p?.farbe ?? ""}`}>{p?.label ?? t.prioritaet}</span>
        {t.faelligAm && (
          <span className={`text-sm ${t.ueberfaellig ? "font-medium text-red-400" : "text-neutral-400"}`}>
            bis {formatDate(t.faelligAm)}
            {t.ueberfaellig && " (überfällig)"}
          </span>
        )}
      </div>
      {t.bezug && <div className="mt-2 text-sm text-neutral-300">{t.bezug}</div>}
      {fuss && <div className="mt-0.5 text-xs text-neutral-500">{fuss}</div>}
    </>
  );
}

// `kategorien` schränkt die Auswahl im Kategorie-Filter auf die in dieser Tabelle vorkommenden ein
// (Standard: alle); bei nur einer Kategorie entfallen Filter und Spalte.
export function TicketTable({
  rows,
  kategorien,
  emptyMessage = "Keine Tickets.",
}: {
  rows: TicketRow[];
  kategorien?: string[];
  emptyMessage?: string;
}) {
  const optionen = TICKET_KATEGORIE.filter((k) => !kategorien || kategorien.includes(k.value));
  const einzeln = optionen.length === 1;
  return (
    <DataTable
      rowHref={(t) => `/tickets/${t.id}`}
      mobileCard={(t) => <TicketKarte t={t} mitKategorie={!einzeln} />}
      columns={einzeln ? columns.filter((c) => c.key !== "kategorie") : columns}
      rows={rows}
      emptyMessage={emptyMessage}
      searchPlaceholder="Tickets durchsuchen…"
      selectFilter={
        einzeln
          ? undefined
          : {
              label: "Kategorie",
              value: (t) => t.kategorie,
              options: optionen.map((k) => ({ value: k.value, label: k.label })),
              placeholder: "Alle Kategorien",
            }
      }
    />
  );
}
