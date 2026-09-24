"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { einheitSortSchluessel } from "@/lib/einheit-sort";
import { PositionBearbeitenForm } from "../position-bearbeiten-form";
import { NachzahlungVerrechnenForm } from "../nachzahlung-verrechnen-form";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { toDateInputValue } from "@/lib/date-utils";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

// Beschreibt die Verteilungsbasis eines Kostenanteil-Beleg-Eintrags für die Anzeige, z.B.
// "35,20 von 420,50 m²" (WOHNFLAECHE), "1 von 12 Einheiten" (EINHEITEN), "180 von 950 kWh"
// (VERBRAUCH_MANUELL) oder "extern vorverteilt" (VORVERTEILT).
function formatVerteilungsbasis(d: KostenanteilDetailEintrag) {
  const formatZahl = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
  if (d.verteilerschluessel === "VORVERTEILT") return "extern vorverteilt";
  if (d.verteilerschluessel === "EINHEITEN") return `1 von ${formatZahl(d.poolMasswert)} Einheiten`;
  return `${formatZahl(d.einheitMasswert)} von ${formatZahl(d.poolMasswert)} ${d.masseinheit}`.trim();
}

// Summe der Restcent-Ausgleiche (±0,01 € je Kostenart, siehe verteileRestcent) dieser Position,
// auf den abgerechneten Zeitraum skaliert wie der Anteil selbst. Cent-genau gerundet.
function restcentSumme(details: KostenanteilDetailEintrag[]): number {
  const summe = details.reduce((s, d) => {
    if (!d.restcent) return s;
    const zeit = d.anteilJahr !== 0 ? d.anteilZeitraum / d.anteilJahr : 1;
    return s + d.restcent * zeit;
  }, 0);
  return Math.round(summe * 100) / 100;
}

export type PositionRow = {
  id: string;
  einheitId: string;
  einheitBezeichnung: string;
  gebaeudeLabel: string;
  // Numerischer Schlüssel für die tatsächliche Haus-Reihenfolge (z.B. "Haus 2, 4, 6" vor "Haus 8,
  // 10, 12" statt alphabetisch "Haus 11, 13, 15" zuerst) — siehe vergleicheHaus in
  // gebaeude-gruppen.ts, hier als einfacher Sortierwert für DataTable vorberechnet.
  gebaeudeSortSchluessel: number;
  mieterNamen: string;
  zeitraumVon: string; // ISO
  zeitraumBis: string; // ISO
  kostenanteilGesamt: number;
  vorauszahlungGesamt: number;
  saldo: number;
  gutschriftSumme: number | null;
  gutschriftDatum: string | null; // ISO
  saldoNachGutschrift: number;
  // Anteil der Gutschrift/Begleichung, der als Forderung aufs Mieterkonto verrechnet wurde (statt
  // per Überweisung), und noch offene Nachzahlung (positiv), die sich so verrechnen ließe.
  verrechnetSumme: number;
  kautionSumme: number;
  offeneNachzahlung: number;
  erledigt: boolean;
  mietvertragId: string | null;
  details: KostenanteilDetailEintrag[];
};

const columns: Column<PositionRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (p) => {
      const [haus, whg] = einheitSortSchluessel(p.einheitBezeichnung);
      return haus * 100000 + whg;
    },
    searchValue: (p) => p.einheitBezeichnung,
    render: (p) => (
      <Link href={`/einheiten/${p.einheitId}`} className="font-medium hover:underline">
        {p.einheitBezeichnung}
      </Link>
    ),
  },
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (p) => p.gebaeudeSortSchluessel,
    searchValue: (p) => p.gebaeudeLabel,
    render: (p) => p.gebaeudeLabel,
  },
  {
    key: "mieter",
    label: "Mieter",
    sortValue: (p) => p.mieterNamen,
    searchValue: (p) => p.mieterNamen,
    render: (p) => p.mieterNamen,
  },
  {
    key: "zeitraum",
    label: "Zeitraum",
    sortValue: (p) => p.zeitraumVon,
    render: (p) => `${formatDate(p.zeitraumVon)} – ${formatDate(p.zeitraumBis)}`,
  },
  {
    key: "kostenanteil",
    label: "Kostenanteil",
    align: "right",
    sortValue: (p) => p.kostenanteilGesamt,
    render: (p) => formatEuro(p.kostenanteilGesamt),
  },
  {
    key: "restcent",
    label: "Restcent",
    align: "right",
    sortValue: (p) => restcentSumme(p.details),
    render: (p) => {
      const r = restcentSumme(p.details);
      const kostenarten = p.details.filter((d) => d.restcent).map((d) => d.kostenartName);
      if (r === 0 && kostenarten.length === 0) return <span className="text-neutral-600">–</span>;
      return (
        <span
          title={`Restcent-Ausgleich bei: ${kostenarten.join(", ")}`}
          className={`rounded px-1.5 py-0.5 text-xs ${r >= 0 ? "bg-amber-500/10 text-amber-400" : "bg-sky-500/10 text-sky-400"}`}
        >
          {r > 0 ? "+" : ""}
          {formatEuro(r)}
        </span>
      );
    },
  },
  {
    key: "vorauszahlung",
    label: "Vorauszahlung",
    align: "right",
    sortValue: (p) => p.vorauszahlungGesamt,
    render: (p) => formatEuro(p.vorauszahlungGesamt),
  },
  {
    key: "saldo",
    label: "Saldo",
    align: "right",
    sortValue: (p) => p.saldo,
    render: (p) => (
      <span className={`font-medium ${p.saldo >= 0 ? "text-green-400" : "text-red-400"}`}>
        {formatEuro(p.saldo)} {p.saldo >= 0 ? "(Guthaben)" : "(Nachzahlung)"}
      </span>
    ),
  },
  {
    key: "gutschrift",
    label: "Rückzahlung/Gutschrift",
    sortValue: (p) => p.gutschriftSumme ?? 0,
    render: (p) =>
      p.gutschriftSumme !== null ? (
        <>
          <span className="text-white">{formatEuro(p.gutschriftSumme)}</span>
          {p.gutschriftDatum && (
            <span className="ml-1 text-xs text-neutral-500">({formatDate(p.gutschriftDatum)})</span>
          )}
          {p.kautionSumme !== 0 && (
            <span
              title="Nachzahlung wurde mit der Kaution verrechnet (Einbehalt unter Kautionen)"
              className="ml-1.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-400"
            >
              mit Kaution verrechnet
            </span>
          )}
          {p.verrechnetSumme !== 0 && (
            <span
              title="Nachzahlung wurde als Forderung aufs Mieterkonto verrechnet (Buchung unter Zahlungen)"
              className="ml-1.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-400"
            >
              als Forderung verrechnet
            </span>
          )}
        </>
      ) : (
        <span className="text-neutral-500">–</span>
      ),
  },
  {
    key: "saldoNachGutschrift",
    label: "Saldo nach Gutschrift",
    sortValue: (p) => p.saldoNachGutschrift,
    render: (p) =>
      p.erledigt ? (
        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">erledigt</span>
      ) : (
        <span className={p.saldoNachGutschrift >= 0 ? "text-green-400" : "text-red-400"}>
          {formatEuro(p.saldoNachGutschrift)}
        </span>
      ),
  },
];

export function PositionenTable({ rows }: { rows: PositionRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Keine Positionen vorhanden."
      searchPlaceholder="Positionen durchsuchen…"
      renderBelow={(p, colSpan) => {
        const details = [...p.details].sort((a, b) => a.kostenartName.localeCompare(b.kostenartName, "de"));
        const summeDetails = details.reduce((s, d) => s + d.anteilZeitraum, 0);
        // Aufschlüsselung und Bearbeiten-Formular schließen sich gegenseitig aus: details ist nur
        // bei einer berechneten Position gefüllt (siehe berechneNebenkostenabrechnung), bei einer
        // manuell erfassten (fuegePositionManuellHinzu) bleibt es leer — die eine ist also nur bei
        // "normal" berechneten Abrechnungen sinnvoll, das Bearbeiten-Formular nur bei manuell
        // erstellten Abrechnungen wie 2024.
        const verrechnen =
          p.offeneNachzahlung > 0.005 && p.mietvertragId ? (
            <NachzahlungVerrechnenForm positionId={p.id} offen={p.offeneNachzahlung} />
          ) : null;
        if (details.length > 0) {
          return (
            <tr key={`${p.id}-details`} className="border-t border-neutral-800 bg-neutral-950/40">
              <td colSpan={colSpan} className="px-4 py-2">
                {verrechnen}
                <details className="text-xs">
                  <summary className="cursor-pointer select-none text-neutral-400 hover:text-white">
                    Kostenanteil-Aufschlüsselung ({details.length})
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full max-w-4xl text-xs">
                      <thead className="text-left text-neutral-500">
                        <tr>
                          <th className="py-1 pr-3">Kostenart</th>
                          <th className="py-1 pr-3">Kostenkreis</th>
                          <th className="py-1 pr-3 text-right">Gesamt (Jahr)</th>
                          <th className="py-1 pr-3">Verteilung</th>
                          <th className="py-1 pr-3 text-right">Anteil (volles Jahr)</th>
                          <th className="py-1 pr-3 text-right">Anteil (Zeitraum)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((d, i) => (
                          <tr key={i} className="border-t border-neutral-800">
                            <td className="py-1 pr-3 text-neutral-300">{d.kostenartName}</td>
                            <td className="py-1 pr-3 text-neutral-500">{d.scopeLabel}</td>
                            <td className="py-1 pr-3 text-right text-neutral-300">{formatEuro(d.gesamtbetragPool)}</td>
                            <td className="py-1 pr-3 text-neutral-500">{formatVerteilungsbasis(d)}</td>
                            <td className="py-1 pr-3 text-right text-neutral-300">{formatEuro(d.anteilJahr)}</td>
                            <td className="py-1 pr-3 text-right text-white">
                              {formatEuro(d.anteilZeitraum)}
                              {d.restcent ? (
                                <span
                                  title="Restcent-Ausgleich: dieser Anteil wurde um einen Cent angepasst, damit die Summe aller Mieter exakt dem Gesamtbetrag entspricht"
                                  className="ml-1.5 rounded bg-amber-500/10 px-1 text-amber-400"
                                >
                                  {d.restcent > 0 ? "+" : "−"}0,01
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-neutral-800 font-medium">
                          <td colSpan={5} className="py-1 pr-3 text-right text-neutral-400">
                            Summe Aufschlüsselung
                          </td>
                          <td className="py-1 pr-3 text-right text-white">{formatEuro(summeDetails)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </details>
              </td>
            </tr>
          );
        }
        if (!p.mietvertragId) return null;
        return (
          <tr key={`${p.id}-details`} className="border-t border-neutral-800 bg-neutral-950/40">
            <td colSpan={colSpan} className="px-4 py-2">
              {verrechnen}
              <PositionBearbeitenForm
                positionId={p.id}
                initialZeitraumVon={toDateInputValue(p.zeitraumVon)}
                initialZeitraumBis={toDateInputValue(p.zeitraumBis)}
                initialKostenanteil={p.kostenanteilGesamt}
                initialVorauszahlung={p.vorauszahlungGesamt}
              />
            </td>
          </tr>
        );
      }}
    />
  );
}
