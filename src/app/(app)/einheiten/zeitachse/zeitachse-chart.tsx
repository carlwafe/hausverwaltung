"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ermittleUeberlappungen, type VertragZeitraum } from "@/lib/mietvertrag-ueberlappung";

export type EinheitZeile = {
  id: string;
  gebaeudeStrasse: string;
  gebaeudeHausnummer: string;
  bezeichnung: string;
  mietvertraege: {
    id: string;
    beginn: string | null;
    ende: string | null;
    status: "AKTIV" | "GEPLANT" | "BEENDET";
    mieterNamen: string;
  }[];
};

const STATUS_FARBEN: Record<string, string> = {
  AKTIV: "bg-green-500/20 border-green-500",
  GEPLANT: "bg-amber-500/20 border-amber-500",
  BEENDET: "bg-neutral-700/40 border-neutral-600",
};

const LABEL_SPALTE_BREITE = 224; // px, entspricht Tailwind w-56
const PX_PRO_JAHR = 90;
const MS_PRO_TAG = 1000 * 60 * 60 * 24;

function tageZwischen(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PRO_TAG;
}

function formatDatum(iso: string | null): string {
  if (!iso) return "unbekannt";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

// Weist jedem Vertrag eine "Spur" (0, 1, 2, …) zu, damit sich zeitlich überlappende Balken
// innerhalb derselben Einheit nicht gegenseitig verdecken — klassisches Greedy-Intervall-Packing:
// ein Vertrag bekommt die erste Spur, deren bisher letzter Vertrag schon vor seinem Beginn
// endet, sonst eine neue Spur. Vertraege ohne echte Überlappung landen dadurch zuverlässig in
// derselben Spur (0), statt unnötig zu alternieren.
function weiseSpurenZu(
  vertraege: { id: string; effBeginn: number; effEnde: number }[],
): Map<string, number> {
  const sortiert = [...vertraege].sort((a, b) => a.effBeginn - b.effBeginn);
  const spurEnden: number[] = [];
  const spurVon = new Map<string, number>();
  for (const v of sortiert) {
    let spur = spurEnden.findIndex((ende) => ende <= v.effBeginn);
    if (spur === -1) {
      spur = spurEnden.length;
      spurEnden.push(v.effEnde);
    } else {
      spurEnden[spur] = v.effEnde;
    }
    spurVon.set(v.id, spur);
  }
  return spurVon;
}

export function ZeitachseChart({ einheiten, heuteIso }: { einheiten: EinheitZeile[]; heuteIso: string }) {
  const heute = useMemo(() => new Date(heuteIso), [heuteIso]);
  const [suche, setSuche] = useState("");
  const [nurUeberlappungen, setNurUeberlappungen] = useState(false);

  // Überlappungen werden pro Einheit unabhängig von Suche/Filter auf dem vollständigen
  // Datenbestand ermittelt — sonst würde ein Filterwechsel die Markierung verändern.
  const einheitenMitUeberlappung = useMemo(
    () =>
      einheiten.map((e) => {
        const zeitraeume: VertragZeitraum[] = e.mietvertraege.map((v) => ({
          id: v.id,
          beginn: v.beginn ? new Date(v.beginn) : null,
          ende: v.ende ? new Date(v.ende) : null,
        }));
        return { ...e, ueberlappendeIds: ermittleUeberlappungen(zeitraeume) };
      }),
    [einheiten],
  );

  const anzahlUeberlappungen = einheitenMitUeberlappung.filter((e) => e.ueberlappendeIds.size > 0).length;

  // Gemeinsamer Maßstab aus dem VOLLSTÄNDIGEN Datenbestand (nicht dem gefilterten) — sonst würde
  // sich die Achse beim Filtern verschieben.
  const { globalMin, globalMax, gesamtTage } = useMemo(() => {
    const bekannteDaten = einheiten
      .flatMap((e) => e.mietvertraege.flatMap((v) => [v.beginn, v.ende]))
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d));
    if (bekannteDaten.length === 0) {
      const vorFuenfJahren = new Date(heute);
      vorFuenfJahren.setFullYear(vorFuenfJahren.getFullYear() - 5);
      return { globalMin: vorFuenfJahren, globalMax: heute, gesamtTage: tageZwischen(vorFuenfJahren, heute) };
    }
    const min = new Date(Math.min(...bekannteDaten.map((d) => d.getTime())));
    const max = new Date(Math.max(heute.getTime(), ...bekannteDaten.map((d) => d.getTime())));

    // Die Achse muss nicht bis zum allerersten je erfassten Mietbeginn zurückreichen (kann
    // jahrzehntealt sein, z.B. ein seit 1978 laufender Garagen-Mietvertrag) — ein fester
    // Rückblick-Horizont hält die jüngeren, für die Überlappungsprüfung relevanteren Jahre
    // lesbar. Ein Vertrag, dessen echter Beginn davor liegt, wird links sichtbar abgeschnitten
    // (siehe vorAchsenbeginn unten) statt die Achse zu strecken.
    const RUECKBLICK_JAHRE = 15;
    const rueckblickHorizont = new Date(heute);
    rueckblickHorizont.setFullYear(rueckblickHorizont.getFullYear() - RUECKBLICK_JAHRE);
    const effektiverMin = new Date(Math.max(min.getTime(), rueckblickHorizont.getTime()));

    // Etwas Luft an beiden Rändern, damit ein Balkenrand nicht direkt am Fensterrand klebt.
    const gepolstertMin = new Date(effektiverMin);
    gepolstertMin.setMonth(gepolstertMin.getMonth() - 2);
    const gepolstertMax = new Date(max);
    gepolstertMax.setMonth(gepolstertMax.getMonth() + 2);
    return { globalMin: gepolstertMin, globalMax: gepolstertMax, gesamtTage: tageZwischen(gepolstertMin, gepolstertMax) };
  }, [einheiten, heute]);

  const trackBreitePx = Math.max(600, (gesamtTage / 365.25) * PX_PRO_JAHR);

  // Auf 3 Nachkommastellen gerundet: der Browser normalisiert CSS-Prozentwerte intern auf eine
  // begrenzte Fließkomma-Genauigkeit — ohne diese Rundung weicht der roh berechnete JS-Wert (bis
  // zu 17 Nachkommastellen) vom Wert ab, den React beim Hydrieren aus dem tatsächlichen DOM
  // ausliest, was einen (rein kosmetischen, aber lästigen) Hydration-Mismatch auslöst.
  function positionProzent(datum: Date): number {
    return Math.round((tageZwischen(globalMin, datum) / gesamtTage) * 100 * 1000) / 1000;
  }

  const jahreImBereich: number[] = [];
  for (let j = globalMin.getFullYear(); j <= globalMax.getFullYear(); j++) {
    jahreImBereich.push(j);
  }

  const suchbegriff = suche.trim().toLowerCase();
  const sichtbareEinheiten = einheitenMitUeberlappung.filter((e) => {
    if (nurUeberlappungen && e.ueberlappendeIds.size === 0) return false;
    if (!suchbegriff) return true;
    const text = `${e.gebaeudeStrasse} ${e.gebaeudeHausnummer} ${e.bezeichnung}`.toLowerCase();
    return text.includes(suchbegriff);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            anzahlUeberlappungen > 0
              ? "bg-red-950/40 text-red-400"
              : "bg-green-950/30 text-green-400"
          }`}
        >
          {anzahlUeberlappungen > 0
            ? `${anzahlUeberlappungen} Einheit${anzahlUeberlappungen === 1 ? "" : "en"} mit Überlappung`
            : "Keine Überlappungen gefunden"}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Gebäude/Einheit suchen…"
            className="w-56 rounded-md border border-neutral-700 bg-transparent px-3 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={nurUeberlappungen}
              onChange={(e) => setNurUeberlappungen(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-transparent"
            />
            Nur Überlappungen anzeigen
          </label>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-green-500 bg-green-500/20" /> Aktiv
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-amber-500 bg-amber-500/20" /> Geplant
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-neutral-600 bg-neutral-700/40" /> Beendet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-2 border-red-500" /> Überlappung
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <div style={{ width: LABEL_SPALTE_BREITE + trackBreitePx }}>
          {/* Jahres-Achse */}
          <div className="flex border-b border-neutral-800 bg-neutral-950 text-xs text-neutral-500">
            <div
              className="sticky left-0 z-10 shrink-0 border-r border-neutral-800 bg-neutral-950 px-3 py-2"
              style={{ width: LABEL_SPALTE_BREITE }}
            />
            <div className="relative shrink-0" style={{ width: trackBreitePx, height: 32 }}>
              {jahreImBereich.map((jahr) => {
                const links = positionProzent(new Date(jahr, 0, 1));
                if (links < 0 || links > 100) return null;
                return (
                  <div key={jahr} className="absolute top-0 h-full border-l border-neutral-800 pl-1 pt-2" style={{ left: `${links}%` }}>
                    {jahr}
                  </div>
                );
              })}
            </div>
          </div>

          {sichtbareEinheiten.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">Keine Einheiten für diese Filter.</p>
          )}

          {sichtbareEinheiten.map((e) => {
            const mitEffektivenDaten = e.mietvertraege.map((v) => ({
              ...v,
              effBeginn: (v.beginn ? new Date(v.beginn) : globalMin).getTime(),
              effEnde: (v.ende ? new Date(v.ende) : heute).getTime(),
            }));
            const spurVon = weiseSpurenZu(mitEffektivenDaten);
            const anzahlSpuren = Math.max(1, ...Array.from(spurVon.values()).map((s) => s + 1));
            const zeilenHoehe = anzahlSpuren * 26 + 12;

            return (
              <div key={e.id} className="flex border-b border-neutral-800 last:border-b-0 hover:bg-neutral-900/40">
                <div
                  className="sticky left-0 z-10 shrink-0 truncate border-r border-neutral-800 bg-neutral-950 px-3 py-3 text-sm"
                  style={{ width: LABEL_SPALTE_BREITE }}
                  title={`${e.gebaeudeStrasse} ${e.gebaeudeHausnummer} — ${e.bezeichnung}`}
                >
                  <Link href={`/einheiten/${e.id}`} className="text-white hover:underline">
                    {e.gebaeudeStrasse} {e.gebaeudeHausnummer}
                  </Link>
                  <div className="truncate text-xs text-neutral-500">{e.bezeichnung}</div>
                </div>
                <div className="relative shrink-0 py-1.5" style={{ width: trackBreitePx, minHeight: zeilenHoehe }}>
                  {jahreImBereich.map((jahr) => {
                    const links = positionProzent(new Date(jahr, 0, 1));
                    if (links < 0 || links > 100) return null;
                    return (
                      <div
                        key={jahr}
                        className="absolute top-0 h-full border-l border-neutral-900"
                        style={{ left: `${links}%` }}
                      />
                    );
                  })}
                  {mitEffektivenDaten.map((v) => {
                    const links = Math.max(0, positionProzent(new Date(v.effBeginn)));
                    const rechts = Math.min(100, positionProzent(new Date(v.effEnde)));
                    const breite = Math.round(Math.max(0.3, rechts - links) * 1000) / 1000;
                    const ueberlappt = e.ueberlappendeIds.has(v.id);
                    // Der tatsächliche Vertragsbeginn liegt vor dem sichtbaren Achsenanfang (durch
                    // den Rückblick-Horizont oben abgeschnitten) — eckige statt runde linke Kante
                    // als Hinweis, dass der Balken hier eigentlich weiterläuft.
                    const vorAchsenbeginn = links === 0 && v.effBeginn < globalMin.getTime();
                    return (
                      <div
                        key={v.id}
                        title={`${v.mieterNamen}\n${formatDatum(v.beginn)} – ${v.ende ? formatDatum(v.ende) : "läuft"}`}
                        className={`absolute flex h-6 items-center overflow-hidden truncate rounded border px-1.5 text-[11px] text-white ${
                          STATUS_FARBEN[v.status]
                        } ${ueberlappt ? "border-2 border-red-500" : ""} ${vorAchsenbeginn ? "rounded-l-none" : ""}`}
                        style={{ left: `${links}%`, width: `${breite}%`, top: (spurVon.get(v.id) ?? 0) * 26 }}
                      >
                        {vorAchsenbeginn && "… "}
                        {v.mieterNamen}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
