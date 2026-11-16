"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { speichereKautionNotiz } from "./actions";
import { KARTE_KENNZEICHEN, KarteKopf, KarteMeta, KarteNotiz, KarteWerte, KarteZeile } from "@/components/karte";

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

// Kurzform für die Tabelle am Computer (voller Text im Tooltip); Karte und Filter zeigen die Langform.
const STATUS_KURZ: Record<keyof typeof STATUS_LABEL, string> = { ...STATUS_LABEL, AUFGELOEST: "Rest offen" };

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
  // Summe der "Auflösung"- bzw. "Auszahlung Mieter"-Kautionsbuchungen dieses Mietvertrags (0,
  // wenn keine vorhanden). einbehalten ist nur gesetzt (nicht null), sobald aufgeloest > 0 ist —
  // bzw. bei einer Bar-Kaution (nie angelegt, keine Auflösung), sobald etwas abgerechnet wurde.
  aufgeloest: number;
  ausgezahlt: number;
  // Mit einer Betriebskostenabrechnung, dem Mieterkonto oder einer vom Vermieter bezahlten Rechnung
  // verrechneter Teil ("Verrechnung mit BK-Abrechnung" / "…Mieterkonto" / "…Rechnung") — ist der
  // Kaution ebenfalls endgültig entzogen, aber ohne Auszahlung.
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
  // Zinsen, die in der Auflösung enthalten waren (Auflösung über angelegter Kaution); null = keine.
  zinsen: number | null;
};

// Mehrzeilig, wächst mit dem Inhalt; speichert beim Verlassen des Felds, nur bei Änderung — wie die
// Kommentarspalte der Betriebskostenabrechnung (pruefung-zellen.tsx).
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
      className="mt-1 block w-full resize-none rounded-md border border-neutral-800 bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
    />
  );
}

const BETRAG = { align: "right", className: "whitespace-nowrap tabular-nums" } as const;

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

// Am Computer darf die Tabelle nicht breiter als die Seite sein (siehe „Tabellen am Computer“ in
// docs/tickets-logo-design.md): Mietende steht unter der Einheit, der Kommentar unter dem Mieter
// (Füllspalte), die Zinsen unter „Aufgelöst“.
const columns: Column<KautionRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    title: "Darunter das Mietende, falls der Vertrag beendet ist",
    sortValue: (r) => r.einheitBezeichnung,
    searchValue: (r) => r.einheitBezeichnung,
    render: (r) => (
      // Feste Breite über das div (nicht die Zelle), sonst drückt die Füllspalte die Spalte zusammen.
      <div className="w-24">
        <Link prefetch={false} href={`/mietvertraege/${r.mietvertragId}`} className={TABELLEN_LINK}>
          {r.einheitBezeichnung}
        </Link>
        {r.warnung && (
          <span title={r.warnung} className="ml-1 text-amber-400">
            ⚠
          </span>
        )}
        {r.mietende && (
          <div title="Mietende" className="text-xs text-neutral-400">
            bis {formatDatum(r.mietende)}
          </div>
        )}
      </div>
    ),
  },
  {
    key: "mieter",
    label: "Mieter · Kommentar",
    title: "Sortiert nach Mieter",
    fuellend: true,
    sortValue: (r) => r.mieterNamen,
    searchValue: (r) => `${r.mieterNamen} ${r.notizen ?? ""}`,
    render: (r) => (
      <>
        <div title={r.mieterNamen} className="truncate">
          {r.mieterNamen}
        </div>
        {r.kautionId && <KommentarFeld kautionId={r.kautionId} notizen={r.notizen ?? ""} />}
      </>
    ),
  },
  {
    key: "betrag",
    label: "Betrag",
    ...BETRAG,
    sortValue: (r) => r.betrag,
    render: (r) => (
      <span className="inline-flex items-center gap-1">
        {r.betragAbweichung && (
          <span
            title={`Weicht von der Summe der "Einzahlung Mieter"-Kautionsbuchungen ab: ${formatEuro(r.einzahlungSumme!)}`}
            className="text-amber-400"
          >
            ⚠
          </span>
        )}
        {formatEuro(r.betrag)}
      </span>
    ),
  },
  {
    key: "aufgeloest",
    label: "Aufgelöst",
    title: "Darunter die in der Auflösung enthaltenen Zinsen",
    ...BETRAG,
    sortValue: (r) => r.aufgeloest,
    render: (r) => (
      <>
        {r.aufgeloest > 0 ? formatEuro(r.aufgeloest) : "–"}
        {r.zinsen ? <div className="text-xs text-neutral-400">Zinsen {formatEuro(r.zinsen)}</div> : null}
      </>
    ),
  },
  {
    key: "ausgezahlt",
    label: "Ausgezahlt",
    ...BETRAG,
    sortValue: (r) => r.ausgezahlt,
    render: (r) => (r.ausgezahlt > 0 ? formatEuro(r.ausgezahlt) : "–"),
  },
  {
    key: "verrechnet",
    label: "Verrechnet",
    title: "Verrechnet mit Betriebskostenabrechnung, Mieterkonto oder Rechnung",
    ...BETRAG,
    sortValue: (r) => r.verrechnet,
    render: (r) => (r.verrechnet > 0 ? formatEuro(r.verrechnet) : "–"),
  },
  {
    key: "einbehalten",
    label: "Einbeh.",
    title: "Einbehalten",
    ...BETRAG,
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
    ...BETRAG,
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
    className: "whitespace-nowrap",
    sortValue: (r) => STATUS_LABEL[r.status],
    searchValue: (r) => STATUS_LABEL[r.status],
    render: (r) => (
      <span title={STATUS_LABEL[r.status]} className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[r.status]}`}>
        {STATUS_KURZ[r.status]}
      </span>
    ),
  },
];

// Karte fürs Handy (siehe `mobileCard` an DataTable). Beträge erscheinen nur, wenn sie etwas aussagen; Warnungen
// stehen als Text in der Karte (Tooltips gibt es auf dem Handy nicht). Der Kommentar ist hier nur lesbar.
function KautionKarte({ r }: { r: KautionRow }) {
  return (
    <>
      <KarteKopf
        titel={r.einheitBezeichnung}
        wert={<span className={`${KARTE_KENNZEICHEN} ${STATUS_FARBE[r.status]}`}>{STATUS_LABEL[r.status]}</span>}
      />
      <KarteZeile>{r.mieterNamen}</KarteZeile>
      {r.mietende && (
        <KarteMeta>
          <span>Mietende {new Intl.DateTimeFormat("de-DE").format(new Date(r.mietende))}</span>
        </KarteMeta>
      )}
      <KarteWerte
        werte={[
          { label: "Kaution", wert: formatEuro(r.betrag) },
          r.zinsen ? { label: "Zinsen", wert: formatEuro(r.zinsen) } : null,
          r.aufgeloest > 0 && { label: "Aufgelöst", wert: formatEuro(r.aufgeloest) },
          r.ausgezahlt > 0 && { label: "Ausgezahlt", wert: formatEuro(r.ausgezahlt) },
          r.verrechnet > 0 && { label: "Verrechnet", wert: formatEuro(r.verrechnet) },
          r.einbehalten !== null && { label: "Einbehalten", wert: formatEuro(r.einbehalten) },
          r.offen !== null && {
            label: "Offen",
            wert: formatEuro(r.offen),
            klasse: r.offen > 0.005 ? "text-amber-400" : r.offen < -0.005 ? "text-red-400" : "text-neutral-500",
          },
        ]}
      />
      {r.betragAbweichung && (
        <div className="mt-1.5 text-xs text-amber-400">
          ⚠ Einzahlungen des Mieters: {formatEuro(r.einzahlungSumme!)}
        </div>
      )}
      {r.warnung && <div className="mt-1.5 text-xs text-amber-400">⚠ {r.warnung}</div>}
      {r.notizen && <KarteNotiz>{r.notizen}</KarteNotiz>}
    </>
  );
}

export function KautionenTable({ rows }: { rows: KautionRow[] }) {
  return (
    <DataTable
      rowHref={(r) => `/mietvertraege/${r.mietvertragId}`}
      mobileCard={(r) => <KautionKarte r={r} />}
      columns={columns}
      rows={rows}
      kompakt
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
