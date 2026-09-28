"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { speichereKautionNotiz } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const STATUS_LABEL = {
  AKTIV: "Aktiv",
  AUFGELOEST: "Aufgelöst, Rest offen",
  // Mehr ausgezahlt als eingenommen (z.B. Kaution doppelt überwiesen) — Rückforderung offen.
  UEBERZAHLT: "Überzahlt",
  ERLEDIGT: "Erledigt",
} as const;

const STATUS_FARBE: Record<keyof typeof STATUS_LABEL, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  AUFGELOEST: "bg-amber-500/10 text-amber-400",
  UEBERZAHLT: "bg-red-500/10 text-red-400",
  ERLEDIGT: "bg-neutral-800 text-neutral-300",
};

export type KautionRow = {
  id: string;
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  // Vertragsende als ISO-Datum; null = Vertrag läuft (noch) ohne Ende.
  mietende: string | null;
  betrag: number;
  // true, wenn es mindestens eine "Einzahlung Mieter"-Kautionsbuchung gibt und ihre Summe
  // (einzahlungSumme) von betrag abweicht.
  betragAbweichung: boolean;
  einzahlungSumme: number | null;
  // null = kein eigener Kaution-Stammdatensatz vorhanden (siehe warnung) — betrifft nur einen
  // synthetisch aus Kautionsbuchungen gebildeten Zeileneintrag.
  anlageform: string | null;
  zinssatz: number | null;
  // Summe der "Auflösung"- bzw. "Auszahlung Mieter"-Kautionsbuchungen dieses Mietvertrags (0,
  // wenn keine vorhanden). einbehalten ist nur gesetzt (nicht null), sobald aufgeloest > 0 ist.
  aufgeloest: number;
  ausgezahlt: number;
  // Mit einer Nebenkostenabrechnung verrechneter Teil des Einbehalts (Kategorie "Verrechnung mit
  // NK-Abrechnung") — ist der Kaution ebenfalls endgültig entzogen, aber ohne Auszahlung.
  verrechnet: number;
  einbehalten: number | null;
  // Davon noch offen: einbehalten ohne die pauschalen, dem Vermieter endgültig gutgeschriebenen
  // Einbehalte — also vorläufig einbehalten (Rechnung folgt) oder gar nicht begründet.
  offen: number | null;
  status: keyof typeof STATUS_LABEL;
  // z.B. "keine Einzahlung Mieter gefunden" oder "kein Kaution-Stammdatensatz angelegt" — siehe
  // warnungFuer in page.tsx. null = nichts Auffälliges.
  warnung: string | null;
  // Id des Kaution-Stammdatensatzes; null bei einer Zeile ohne eigenen Datensatz (dann kein Kommentar).
  kautionId: string | null;
  notizen: string | null;
};

// Mehrzeilig, wächst mit dem Inhalt; speichert beim Verlassen des Felds, nur bei Änderung — wie die
// Kommentarspalte der Nebenkostenabrechnung (pruefung-zellen.tsx).
function KommentarFeld({ kautionId, notizen }: { kautionId: string; notizen: string }) {
  const [wert, setWert] = useState(notizen);
  const [gespeichert, setGespeichert] = useState(notizen);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [wert]);

  function speichern() {
    if (wert.trim() === gespeichert.trim()) return;
    startTransition(async () => {
      await speichereKautionNotiz(kautionId, wert);
      setGespeichert(wert);
    });
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onBlur={speichern}
      disabled={isPending}
      placeholder="Kommentar…"
      maxLength={500}
      className="block w-56 resize-none rounded-md border border-neutral-800 bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
    />
  );
}

const columns: Column<KautionRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (r) => r.einheitBezeichnung,
    searchValue: (r) => r.einheitBezeichnung,
    render: (r) => (
      <span className="inline-flex items-center gap-1">
        <Link href={`/mietvertraege/${r.mietvertragId}`} className="font-medium hover:underline">
          {r.einheitBezeichnung}
        </Link>
        {r.warnung && (
          <span title={r.warnung} className="text-amber-400">
            ⚠
          </span>
        )}
      </span>
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
    key: "mietende",
    label: "Mietende",
    sortValue: (r) => r.mietende ?? "9999",
    render: (r) => (r.mietende ? new Intl.DateTimeFormat("de-DE").format(new Date(r.mietende)) : "–"),
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
    key: "verrechnet",
    label: "Mit NK verrechnet",
    sortValue: (r) => r.verrechnet,
    render: (r) => (r.verrechnet > 0 ? formatEuro(r.verrechnet) : "–"),
  },
  {
    key: "einbehalten",
    label: "Einbehalten",
    sortValue: (r) => r.einbehalten ?? -1,
    render: (r) =>
      r.einbehalten === null ? (
        "–"
      ) : (
        <span className="text-neutral-300">{formatEuro(r.einbehalten)}</span>
      ),
  },
  {
    key: "offen",
    label: "Offen",
    sortValue: (r) => r.offen ?? -1,
    render: (r) =>
      r.offen === null ? (
        "–"
      ) : (
        <span className={r.offen > 0.005 ? "text-amber-400" : r.offen < -0.005 ? "text-red-400" : "text-neutral-500"}>
          {formatEuro(r.offen)}
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
  {
    key: "kommentar",
    label: "Kommentar",
    sortValue: (r) => r.notizen ?? "",
    searchValue: (r) => r.notizen ?? "",
    render: (r) =>
      r.kautionId ? <KommentarFeld kautionId={r.kautionId} notizen={r.notizen ?? ""} /> : <span className="text-neutral-600">–</span>,
  },
];

export function KautionenTable({ rows }: { rows: KautionRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kautionen erfasst."
      searchPlaceholder="Kautionen durchsuchen…"
      selectFilter={{
        label: "Status",
        placeholder: "Alle Status",
        value: (r) => r.status,
        options: [
          { value: "AKTIV", label: "Aktiv" },
          { value: "AUFGELOEST", label: "Offen (aufgelöst, Rest offen)" },
          { value: "UEBERZAHLT", label: "Überzahlt" },
          { value: "ERLEDIGT", label: "Erledigt" },
        ],
      }}
    />
  );
}
