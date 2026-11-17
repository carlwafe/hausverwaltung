"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { speichereKautionNotiz } from "./actions";
import { KARTE_KENNZEICHEN, KarteKopf, KarteMeta, KarteNotiz, KarteWerte, KarteZeile } from "@/components/karte";
import type { KautionUebersichtZeile } from "@/lib/kautionen-uebersicht";
import { ANLAGEFORM_LABEL, type KautionPhase, type KautionSchrittTon } from "@/lib/kaution-schritt";
import { KautionBewegungen } from "./kaution-bewegungen";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const TON_FARBE: Record<KautionSchrittTon, string> = {
  warnung: "bg-amber-500/10 text-amber-400",
  fehler: "bg-red-500/10 text-red-400",
  hinweis: "bg-neutral-800 text-neutral-300",
};

const offenFarbe = (v: number) => (v > 0.015 ? "text-amber-400" : v < -0.015 ? "text-red-400" : "text-neutral-500");

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

function warnTexte(r: KautionUebersichtZeile) {
  return [r.warnung, r.abweichung].filter((t): t is string => !!t);
}

const einheitSpalte: Column<KautionUebersichtZeile> = {
  key: "einheit",
  label: "Einheit",
  title: "Darunter das Mietende, falls bekannt",
  sortValue: (r) => r.einheitBezeichnung,
  searchValue: (r) => r.einheitBezeichnung,
  render: (r) => (
    // Feste Breite über das div (nicht die Zelle), sonst drückt die Füllspalte die Spalte zusammen.
    <div className="w-28">
      <Link prefetch={false} href={`/mietvertraege/${r.mietvertragId}?reiter=kaution`} className={TABELLEN_LINK}>
        {r.einheitBezeichnung}
      </Link>
      {warnTexte(r).length > 0 && (
        <span title={warnTexte(r).join("\n")} className="ml-1 text-amber-400">
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
};

const mieterSpalte: Column<KautionUebersichtZeile> = {
  key: "mieter",
  label: "Mieter · Kommentar",
  title: "Sortiert nach Mieter",
  fuellend: true,
  sortValue: (r) => r.mieterNamen,
  searchValue: (r) => `${r.mieterNamen} ${r.notizen ?? ""} ${r.schritt ?? ""}`,
  render: (r) => (
    <>
      <div title={r.mieterNamen} className="truncate">
        {r.mieterNamen}
      </div>
      {r.kautionId && <KommentarFeld kautionId={r.kautionId} notizen={r.notizen ?? ""} />}
    </>
  ),
};

// Pfeil am Zeilenende: zeigt, dass sich die Zeile aufklappen lässt (Klick irgendwo auf die Zeile).
const klappSpalte: Column<KautionUebersichtZeile> = {
  key: "klappen",
  label: "",
  className: "w-8",
  render: (_r, { expanded, toggleExpanded }) => (
    <button
      type="button"
      onClick={toggleExpanded}
      aria-label={expanded ? "Bewegungen ausblenden" : "Bewegungen anzeigen"}
      aria-expanded={expanded}
      className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
        <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  ),
};

const guthabenSpalte: Column<KautionUebersichtZeile> = {
  key: "guthaben",
  label: "Kaution",
  title: "Eingezahlte Kaution einschließlich Zinsen",
  ...BETRAG,
  sortValue: (r) => r.guthaben,
  render: (r) => (
    <>
      {formatEuro(r.guthaben)}
      {r.zinsen > 0.005 && <div className="text-xs text-neutral-400">inkl. Zinsen {formatEuro(r.zinsen)}</div>}
    </>
  ),
};

const ausgezahltSpalte: Column<KautionUebersichtZeile> = {
  key: "ausgezahlt",
  label: "Ausgezahlt",
  ...BETRAG,
  sortValue: (r) => r.ausgezahlt,
  render: (r) => (Math.abs(r.ausgezahlt) > 0.005 ? formatEuro(r.ausgezahlt) : "–"),
};

const einbehaltenSpalte: Column<KautionUebersichtZeile> = {
  key: "einbehalten",
  label: "Einbehalten",
  title: "Einbehalte und Verrechnungen (BK-Abrechnung, Mieterkonto, Rechnung); darunter strittig zurückbehaltene",
  ...BETRAG,
  sortValue: (r) => r.einbehalten + r.strittig,
  render: (r) => (
    <>
      {r.einbehalten > 0.005 ? formatEuro(r.einbehalten) : "–"}
      {r.strittig > 0.005 && <div className="text-xs text-amber-400">strittig {formatEuro(r.strittig)}</div>}
    </>
  ),
};

const SPALTEN: Record<KautionPhase, Column<KautionUebersichtZeile>[]> = {
  ZU_TUN: [
    einheitSpalte,
    mieterSpalte,
    guthabenSpalte,
    ausgezahltSpalte,
    einbehaltenSpalte,
    {
      key: "offen",
      label: "Offen",
      title: "Noch an den Mieter auszuzahlen (negativ: zu viel ausgezahlt bzw. vom Mieter nachzufordern)",
      ...BETRAG,
      sortValue: (r) => r.nochOffen,
      render: (r) => <span className={offenFarbe(r.nochOffen)}>{formatEuro(r.nochOffen)}</span>,
    },
    {
      key: "schritt",
      label: "Nächster Schritt",
      sortValue: (r) => r.schritt ?? "",
      render: (r) =>
        r.schritt && r.ton ? (
          <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${TON_FARBE[r.ton]}`}>{r.schritt}</span>
        ) : null,
    },
    klappSpalte,
  ],
  HINTERLEGT: [
    einheitSpalte,
    mieterSpalte,
    {
      key: "soll",
      label: "Kaution",
      title: "Vereinbarte Kaution",
      ...BETRAG,
      sortValue: (r) => r.soll ?? 0,
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.abweichung && (
            <span title={r.abweichung} className="text-amber-400">
              ⚠
            </span>
          )}
          {r.soll !== null ? formatEuro(r.soll) : "–"}
        </span>
      ),
    },
    {
      key: "erhalten",
      label: "Eingezahlt",
      className: "whitespace-nowrap",
      sortValue: (r) => r.erhaltenAm ?? "",
      render: (r) =>
        r.erhaltenAm ? (
          formatDatum(r.erhaltenAm)
        ) : r.eingezahlt > 0.005 ? (
          <span className="text-xs text-neutral-400">vor Buchhaltungsbeginn</span>
        ) : (
          "–"
        ),
    },
    {
      key: "anlage",
      label: "Anlage",
      className: "whitespace-nowrap",
      sortValue: (r) => (r.anlageform ? ANLAGEFORM_LABEL[r.anlageform] ?? r.anlageform : ""),
      render: (r) => (r.anlageform ? ANLAGEFORM_LABEL[r.anlageform] ?? r.anlageform : "–"),
    },
    {
      key: "stand",
      label: "Guthaben",
      title: "Kautionsguthaben des Mieters (Einzahlung, Zinsen, abzüglich Einbehalte)",
      ...BETRAG,
      sortValue: (r) => r.stand,
      render: (r) => formatEuro(r.stand),
    },
    klappSpalte,
  ],
  ERLEDIGT: [
    einheitSpalte,
    mieterSpalte,
    guthabenSpalte,
    ausgezahltSpalte,
    einbehaltenSpalte,
    {
      key: "erledigt",
      label: "Letzte Bewegung",
      className: "whitespace-nowrap",
      sortValue: (r) => r.letzteBewegung ?? "",
      render: (r) => (r.letzteBewegung ? formatDatum(r.letzteBewegung) : "–"),
    },
    klappSpalte,
  ],
};

// Karte fürs Handy (siehe `mobileCard` an DataTable): führt zum Kautionskonto am Mietvertrag, weil sich
// die Bewegungen in der Kartenansicht nicht aufklappen lassen. Warnungen stehen als Text in der Karte.
function KautionKarte({ r }: { r: KautionUebersichtZeile }) {
  return (
    <>
      <KarteKopf
        titel={r.einheitBezeichnung}
        wert={
          r.schritt && r.ton ? <span className={`${KARTE_KENNZEICHEN} ${TON_FARBE[r.ton]}`}>{r.schritt}</span> : undefined
        }
      />
      <KarteZeile>{r.mieterNamen}</KarteZeile>
      {r.mietende && (
        <KarteMeta>
          <span>Mietende {formatDatum(r.mietende)}</span>
        </KarteMeta>
      )}
      <KarteWerte
        werte={
          r.phase === "HINTERLEGT"
            ? [
                { label: "Kaution", wert: r.soll !== null ? formatEuro(r.soll) : "–" },
                { label: "Guthaben", wert: formatEuro(r.stand) },
                r.anlageform ? { label: "Anlage", wert: ANLAGEFORM_LABEL[r.anlageform] ?? r.anlageform } : null,
              ]
            : [
                { label: "Kaution", wert: formatEuro(r.guthaben) },
                Math.abs(r.ausgezahlt) > 0.005 && { label: "Ausgezahlt", wert: formatEuro(r.ausgezahlt) },
                r.einbehalten > 0.005 && { label: "Einbehalten", wert: formatEuro(r.einbehalten) },
                r.strittig > 0.005 && { label: "Strittig", wert: formatEuro(r.strittig), klasse: "text-amber-400" },
                r.phase === "ZU_TUN" && { label: "Offen", wert: formatEuro(r.nochOffen), klasse: offenFarbe(r.nochOffen) },
              ]
        }
      />
      {warnTexte(r).map((t) => (
        <div key={t} className="mt-1.5 text-xs text-amber-400">
          ⚠ {t}
        </div>
      ))}
      {r.notizen && <KarteNotiz>{r.notizen}</KarteNotiz>}
    </>
  );
}

const LEER: Record<KautionPhase, string> = {
  ZU_TUN: "Bei keiner Kaution ist etwas zu tun.",
  HINTERLEGT: "Keine hinterlegten Kautionen.",
  ERLEDIGT: "Noch keine abgerechneten Kautionen.",
};

export function KautionenTable({
  phase,
  rows,
  onBuchungErfassen,
}: {
  phase: KautionPhase;
  rows: KautionUebersichtZeile[];
  onBuchungErfassen: (mietvertragId: string) => void;
}) {
  return (
    <DataTable
      // Neu montieren beim Reiterwechsel: Suche, Sortierung und aufgeklappte Zeile gehören zum Reiter.
      key={phase}
      columns={SPALTEN[phase]}
      rows={rows}
      kompakt
      zeileKlappt
      renderExpanded={(r, colSpan) => (
        <tr className="bg-neutral-900">
          <td colSpan={colSpan} className="px-3 pb-4 pt-1">
            <KautionBewegungen zeile={r} onBuchungErfassen={() => onBuchungErfassen(r.mietvertragId)} />
          </td>
        </tr>
      )}
      mobileCard={(r) => <KautionKarte r={r} />}
      mobileCardHref={(r) => `/mietvertraege/${r.mietvertragId}?reiter=kaution`}
      emptyMessage={LEER[phase]}
      searchPlaceholder="Einheit, Mieter, Kommentar…"
    />
  );
}
