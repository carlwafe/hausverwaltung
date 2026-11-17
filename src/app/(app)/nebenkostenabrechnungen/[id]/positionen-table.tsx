"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { einheitSortSchluessel } from "@/lib/einheit-sort";
import { PositionBearbeitenForm } from "../position-bearbeiten-form";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { saldoMitToleranz } from "@/lib/nk-saldo";
import { toDateInputValue } from "@/lib/date-utils";
import { VerwalterAbgleichStern, KommentarFeld } from "./pruefung-zellen";
import { KARTE_KENNZEICHEN, KarteKopf, KarteMeta, KarteNotiz, KarteWerte, KarteZeile } from "@/components/karte";

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
// Saldo nach Gutschrift mit dem Kostenanteil der Vergleichsrechnung (Vorauszahlung und
// Rückzahlung/Gutschrift unverändert); null, solange keine abweichende Fläche eingetragen ist.
function saldoNachGutschriftVergleich(p: PositionRow): number | null {
  if (p.kostenanteilSimuliert === null) return null;
  return saldoMitToleranz(p.vorauszahlungGesamt - p.kostenanteilSimuliert - (p.gutschriftSumme ?? 0));
}

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
  // Anteil der Gutschrift/Begleichung, der aufs Mieterkonto verrechnet wurde (statt per
  // Überweisung), und noch offene Nachzahlung (positiv).
  verrechnetSumme: number;
  kautionSumme: number;
  auszahlungDatum: string | null; // ISO
  verrechnetDatum: string | null; // ISO
  kautionDatum: string | null; // ISO
  erledigt: boolean;
  mietvertragId: string | null;
  abrechnungId: string;
  // Kostenanteil der Vergleichsrechnung zur Gesamtfläche (siehe QmAbweichungen: "wie Verwalter" bzw.
  // "mit korrekten Flächen"); null = keine Abweichung eingetragen.
  kostenanteilSimuliert: number | null;
  // Manuelle Position (von Hand angelegt/bearbeitet); sonst berechnet.
  manuell: boolean;
  // Live-Berechnung neben einer manuellen Position (nur bei berechneter Abrechnung, nie gespeichert).
  berechnet: { kostenanteil: number; vorauszahlung: number; saldo: number } | null;
  // Manuelle Prüfnotizen (siehe NebenkostenabrechnungPruefung): Stern = Berechnung stimmt mit der
  // des Verwalters überein, dazu ein kurzer Kommentar.
  stimmtMitVerwalter: boolean;
  kommentar: string;
  details: KostenanteilDetailEintrag[];
};

// Manuelle Position mit Live-Berechnung daneben: zwei Zeilen "manuell" / "berechnet".
function ZweiZeilen({ manuell, berechnet }: { manuell: string; berechnet: string }) {
  return (
    <span className="flex flex-col items-end gap-0.5 whitespace-nowrap">
      <span>
        <span className="mr-1.5 text-xs text-violet-400">manuell</span>
        {manuell}
      </span>
      <span className="text-xs text-neutral-400">
        <span className="mr-1.5 text-neutral-500">berechnet</span>
        {berechnet}
      </span>
    </span>
  );
}

/** Abrechnungszeitraum, wenn er nicht das ganze Kalenderjahr umfasst (Ein-/Auszug im Jahr) — sonst null. */
function teilZeitraum(p: PositionRow): string | null {
  if (p.zeitraumVon.slice(5, 10) === "01-01" && p.zeitraumBis.slice(5, 10) === "12-31") return null;
  return `${formatDate(p.zeitraumVon)} – ${formatDate(p.zeitraumBis)}`;
}

/** Hat die Zeile etwas zum Aufklappen (Aufschlüsselung oder Bearbeiten-Formular)? */
function aufklappbar(p: PositionRow): boolean {
  return p.details.length > 0 || p.mietvertragId !== null;
}

function RestcentKennzeichen({ p }: { p: PositionRow }) {
  const r = restcentSumme(p.details);
  const kostenarten = p.details.filter((d) => d.restcent).map((d) => d.kostenartName);
  if (kostenarten.length === 0) return null;
  return (
    <span
      title={`Restcent-Ausgleich ${r > 0 ? "+" : ""}${formatEuro(r)} bei: ${kostenarten.join(", ")}`}
      className={`mr-1.5 rounded px-1 py-0.5 text-xs ${r >= 0 ? "bg-amber-500/10 text-amber-400" : "bg-sky-500/10 text-sky-400"}`}
    >
      {r > 0 ? "+" : r < 0 ? "−" : "±"}
      {Math.abs(r).toFixed(2).replace(".", ",")}
    </span>
  );
}

// vergleichName: Bezeichnung der Vergleichsrechnung zur Gesamtfläche — "Flächen wie Verwalter"
// (Abrechnung mit unseren Flächen) oder "mit korrekten Flächen" (Abrechnung mit Verwalter-Flächen);
// vergleichKurz steht klein vor dem Vergleichswert, der volle Name im Tooltip.
// Aufbau nach „Tabellen am Computer“ in docs/tickets-logo-design.md: Nebenangaben stehen klein unter
// der Hauptangabe (Gebäude unter der Einheit, Teil-Zeitraum und Kommentar beim Mieter), damit die
// Betragsspalten in die Seitenbreite passen.
function baueSpalten(vergleichName: string, vergleichKurz: string): Column<PositionRow>[] {
  const betrag = "whitespace-nowrap tabular-nums";
  return [
    {
      key: "einheit",
      label: "Einheit",
      sortValue: (p) => {
        const [haus, whg] = einheitSortSchluessel(p.einheitBezeichnung);
        return haus * 100000 + whg;
      },
      searchValue: (p) => `${p.einheitBezeichnung} ${p.gebaeudeLabel}`,
      render: (p, ctx) => (
        <div className="flex w-40 items-start gap-2">
          {aufklappbar(p) ? (
            <button
              type="button"
              onClick={ctx.toggleExpanded}
              aria-expanded={ctx.expanded}
              title={p.details.length > 0 ? "Kostenanteil-Aufschlüsselung und Überschreiben" : "Position bearbeiten"}
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-700 text-[10px] leading-none text-neutral-400 hover:border-neutral-500 hover:text-white"
            >
              {ctx.expanded ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <div className="min-w-0">
            <Link
              prefetch={false}
              href={p.mietvertragId ? `/mietvertraege/${p.mietvertragId}` : `/einheiten/${p.einheitId}`}
              className={TABELLEN_LINK}
            >
              {p.einheitBezeichnung}
            </Link>
            <div className="text-xs text-neutral-500">{p.gebaeudeLabel}</div>
            {p.manuell && (
              <span
                title="Manuell angelegte/bearbeitete Position — bleibt bei Berechnung und Umstellen erhalten"
                className="mt-0.5 inline-block rounded-full bg-violet-500/10 px-1.5 text-xs text-violet-400"
              >
                manuell
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "mieter",
      label: "Mieter / Kommentar",
      fuellend: true,
      sortValue: (p) => p.mieterNamen,
      searchValue: (p) => `${p.mieterNamen} ${p.kommentar}`,
      render: (p) => {
        const zeitraum = teilZeitraum(p);
        return (
          <div className="min-w-0">
            <div className="truncate" title={p.mieterNamen}>
              {p.mieterNamen}
            </div>
            {zeitraum && (
              <div className="truncate text-xs text-neutral-400" title="Abrechnungszeitraum (nicht das ganze Jahr)">
                {zeitraum}
              </div>
            )}
            {p.mietvertragId && (
              <div className="mt-1">
                <KommentarFeld
                  abrechnungId={p.abrechnungId}
                  mietvertragId={p.mietvertragId}
                  kommentar={p.kommentar}
                  rows={1}
                  breite="w-full"
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "kostenanteil",
      label: "Kostenanteil",
      align: "right",
      className: betrag,
      sortValue: (p) => p.kostenanteilGesamt,
      render: (p) => {
        if (p.berechnet) {
          return <ZweiZeilen manuell={formatEuro(p.kostenanteilGesamt)} berechnet={formatEuro(p.berechnet.kostenanteil)} />;
        }
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span>
              <RestcentKennzeichen p={p} />
              {formatEuro(p.kostenanteilGesamt)}
            </span>
            {p.kostenanteilSimuliert !== null && (
              <span className="text-xs text-neutral-400" title={`Kostenanteil ${vergleichName}`}>
                <span className="text-neutral-500">{vergleichKurz}</span> {formatEuro(p.kostenanteilSimuliert)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "vorauszahlung",
      label: "Vorausz.",
      align: "right",
      className: betrag,
      title:
        "Vorauszahlung — tatsächlich gezahlte BK-Vorauszahlung: je Mietmonat bis 2024 zuerst auf die BK (bis zum BK-Soll), ab 2025 anteilig im Verhältnis BK : Kaltmiete, auf volle Euro gerundet (§ 366 Abs. 2 BGB)",
      sortValue: (p) => p.vorauszahlungGesamt,
      render: (p) =>
        p.berechnet ? (
          <ZweiZeilen manuell={formatEuro(p.vorauszahlungGesamt)} berechnet={formatEuro(p.berechnet.vorauszahlung)} />
        ) : (
          formatEuro(p.vorauszahlungGesamt)
        ),
    },
    {
      key: "saldo",
      label: "Saldo",
      align: "right",
      className: betrag,
      title: "Vorauszahlung − Kostenanteil: positiv = Guthaben des Mieters, negativ = Nachzahlung.",
      sortValue: (p) => p.saldo,
      render: (p) => {
        const art = (v: number) => (v >= 0 ? "Guthaben" : "Nachzahlung");
        const farbe = (v: number) => (v >= 0 ? "text-green-400" : "text-red-400");
        if (p.berechnet) {
          return (
            <span className="flex flex-col items-end gap-0.5">
              <span className={`font-medium ${farbe(p.saldo)}`} title={art(p.saldo)}>
                <span className="mr-1.5 text-xs font-normal text-violet-400">manuell</span>
                {formatEuro(p.saldo)}
              </span>
              <span className={`text-xs ${farbe(p.berechnet.saldo)}`} title={art(p.berechnet.saldo)}>
                <span className="mr-1.5 text-neutral-500">berechnet</span>
                {formatEuro(p.berechnet.saldo)}
              </span>
            </span>
          );
        }
        return (
          <span className="flex flex-col items-end">
            <span className={`font-medium ${farbe(p.saldo)}`}>{formatEuro(p.saldo)}</span>
            <span className="text-xs text-neutral-500">{art(p.saldo)}</span>
          </span>
        );
      },
    },
    {
      key: "gutschrift",
      label: "Gutschrift",
      title:
        "Rückzahlung/Gutschrift: tatsächlich gebuchte Betriebskostenausgleich-Zahlungen und Verrechnungen für Mietvertrag und Jahr.",
      sortValue: (p) => p.gutschriftSumme ?? 0,
      render: (p) => {
        if (p.gutschriftSumme === null) return <span className="text-neutral-500">–</span>;
        // Gesamtsumme in Auszahlung/Einzug und die beiden Verrechnungsarten aufgeteilt.
        const ausgezahlt = Math.round((p.gutschriftSumme - p.verrechnetSumme - p.kautionSumme) * 100) / 100;
        const teile: { key: string; betrag: number; label: string; datum: string | null; title: string; farbe: string }[] = [
          {
            key: "auszahlung",
            betrag: ausgezahlt,
            label: ausgezahlt >= 0 ? "ausgezahlt" : "eingezogen",
            datum: p.auszahlungDatum,
            title: "Tatsächliche Kontobewegung (Betriebskostenausgleich)",
            farbe: "bg-green-500/10 text-green-400",
          },
          {
            key: "verrechnet",
            betrag: p.verrechnetSumme,
            label: "verrechnet",
            datum: p.verrechnetDatum,
            title: "Auf das Mieterkonto verrechnet, ohne Kontobewegung (Buchung unter Zahlungen)",
            farbe: "bg-sky-500/10 text-sky-400",
          },
          {
            key: "kaution",
            betrag: p.kautionSumme,
            label: "Kaution",
            datum: p.kautionDatum,
            title: "Mit der Kaution verrechnet (Einbehalt unter Kautionen)",
            farbe: "bg-sky-500/10 text-sky-400",
          },
        ].filter((t) => Math.abs(t.betrag) >= 0.005);
        return (
          <div className="space-y-1">
            {teile.map((t) => (
              <div key={t.key} className="whitespace-nowrap">
                <span className="tabular-nums text-white">{formatEuro(t.betrag)}</span>
                <span title={t.title} className={`ml-1.5 rounded px-1.5 py-0.5 text-xs ${t.farbe}`}>
                  {t.label}
                </span>
                {t.datum && <div className="text-xs text-neutral-500">{formatDate(t.datum)}</div>}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: "saldoNachGutschrift",
      label: "Noch offen",
      align: "right",
      className: betrag,
      title:
        "Saldo nach Gutschrift = Saldo − Rückzahlung/Gutschrift: was nach den gebuchten Zahlungen und Verrechnungen noch offen ist. 0 (bis 1 Cent) = erledigt.",
      sortValue: (p) => p.saldoNachGutschrift,
      render: (p) => {
        const zelle = (saldo: number) =>
          saldo === 0 ? (
            <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">erledigt</span>
          ) : (
            <span className={saldo >= 0 ? "text-green-400" : "text-red-400"}>{formatEuro(saldo)}</span>
          );
        if (p.berechnet) {
          const berechnetNach = saldoMitToleranz(p.berechnet.saldo - (p.gutschriftSumme ?? 0));
          return (
            <span className="flex flex-col items-end gap-0.5">
              <span>
                <span className="mr-1.5 text-xs text-violet-400">manuell</span>
                {zelle(p.saldoNachGutschrift)}
              </span>
              <span className="text-xs">
                <span className="mr-1.5 text-neutral-500">berechnet</span>
                {zelle(berechnetNach)}
              </span>
            </span>
          );
        }
        const vergleich = saldoNachGutschriftVergleich(p);
        if (vergleich === null) return zelle(p.saldoNachGutschrift);
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span>{zelle(p.saldoNachGutschrift)}</span>
            <span className="text-xs" title={`Noch offen ${vergleichName}`}>
              <span className="text-neutral-500">{vergleichKurz}</span> {zelle(vergleich)}
            </span>
          </span>
        );
      },
    },
    {
      key: "verwalter",
      label: "★",
      title: "Stern = Berechnung stimmt mit der des Verwalters überein.",
      sortValue: (p) => (p.stimmtMitVerwalter ? 1 : 0),
      render: (p) =>
        p.mietvertragId ? (
          <VerwalterAbgleichStern
            key={`${p.abrechnungId}-${p.mietvertragId}-${p.stimmtMitVerwalter}`}
            abrechnungId={p.abrechnungId}
            mietvertragId={p.mietvertragId}
            stimmt={p.stimmtMitVerwalter}
          />
        ) : (
          <span className="text-neutral-600">–</span>
        ),
    },
  ];
}

// Karte fürs Handy (siehe `mobileCard` an DataTable): die gespeicherten Werte der Position. Aufschlüsselung,
// Bearbeiten, Vergleichsrechnung und Prüfnotizen gibt es nur in der Tabelle.
function PositionKarte({ p }: { p: PositionRow }) {
  const erledigt = p.saldoNachGutschrift === 0;
  return (
    <>
      <KarteKopf
        titel={
          <>
            {p.einheitBezeichnung}
            {p.manuell && (
              <span className="ml-1.5 inline-block rounded-full bg-violet-500/10 px-1.5 text-xs font-normal text-violet-400">
                manuell
              </span>
            )}
          </>
        }
        wert={
          erledigt ? (
            <span className={`${KARTE_KENNZEICHEN} bg-green-500/10 text-green-400`}>erledigt</span>
          ) : (
            formatEuro(p.saldoNachGutschrift)
          )
        }
        wertKlasse={p.saldoNachGutschrift >= 0 ? "text-green-400" : "text-red-400"}
        wertLabel={erledigt ? undefined : "noch offen"}
      />
      <KarteZeile>{p.mieterNamen || "–"}</KarteZeile>
      <KarteMeta>
        <span>
          {formatDate(p.zeitraumVon)} – {formatDate(p.zeitraumBis)}
        </span>
        {p.stimmtMitVerwalter && <span className="text-xs text-amber-300">★ stimmt mit Verwalter</span>}
      </KarteMeta>
      <KarteWerte
        werte={[
          { label: "Kostenanteil", wert: formatEuro(p.kostenanteilGesamt) },
          { label: "Vorauszahlung", wert: formatEuro(p.vorauszahlungGesamt) },
          {
            label: p.saldo >= 0 ? "Guthaben" : "Nachzahlung",
            wert: formatEuro(p.saldo),
            klasse: p.saldo >= 0 ? "text-green-400" : "text-red-400",
          },
          p.gutschriftSumme !== null && { label: "Gutschrift", wert: formatEuro(p.gutschriftSumme) },
        ]}
      />
      {p.kommentar && <KarteNotiz>{p.kommentar}</KarteNotiz>}
    </>
  );
}

export function PositionenTable({
  rows,
  vergleichName,
  vergleichKurz,
}: {
  rows: PositionRow[];
  vergleichName: string;
  vergleichKurz: string;
}) {
  const spalten = useMemo(() => baueSpalten(vergleichName, vergleichKurz), [vergleichName, vergleichKurz]);
  return (
    <DataTable
      kompakt
      rowHref={(p) => (p.mietvertragId ? `/mietvertraege/${p.mietvertragId}` : `/einheiten/${p.einheitId}`)}
      columns={spalten}
      rows={rows}
      emptyMessage="Keine Positionen vorhanden."
      searchPlaceholder="Positionen durchsuchen…"
      mobileCard={(p) => <PositionKarte p={p} />}
      renderExpanded={(p, colSpan) => {
        const details = [...p.details].sort((a, b) => a.kostenartName.localeCompare(b.kostenartName, "de"));
        const summeDetails = details.reduce((s, d) => s + d.anteilZeitraum, 0);
        // Aufschlüsselung gibt es nur bei einer berechneten Position (details gefüllt, siehe
        // berechneNebenkostenabrechnung); eine manuell erfasste (fuegePositionManuellHinzu) hat nur das
        // Bearbeiten-Formular. Bei einer berechneten heißt Bearbeiten „Manuell überschreiben“.
        if (details.length === 0 && !p.mietvertragId) return null;
        return (
          <tr key={`${p.id}-details`} className="border-t border-neutral-800 bg-neutral-900/40">
            <td colSpan={colSpan} className="px-4 py-3">
              {details.length > 0 && (
                <div className="mb-3 overflow-x-auto">
                  <p className="mb-1 text-xs font-medium text-neutral-300">Kostenanteil-Aufschlüsselung ({details.length})</p>
                  <table className="w-full max-w-4xl text-xs">
                    <thead className="text-left text-neutral-500">
                      <tr>
                        <th className="py-1 pr-3 font-normal">Kostenart</th>
                        <th className="py-1 pr-3 font-normal">Kostenkreis</th>
                        <th className="py-1 pr-3 text-right font-normal">Gesamt (Jahr)</th>
                        <th className="py-1 pr-3 font-normal">Verteilung</th>
                        <th className="py-1 pr-3 text-right font-normal">Anteil (volles Jahr)</th>
                        <th className="py-1 pr-3 text-right font-normal">Anteil (Zeitraum)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d, i) => (
                        <tr key={i} className="border-t border-neutral-800">
                          <td className="py-1 pr-3 text-neutral-300">{d.kostenartName}</td>
                          <td className="py-1 pr-3 text-neutral-500">{d.scopeLabel}</td>
                          <td className="py-1 pr-3 text-right tabular-nums text-neutral-300">{formatEuro(d.gesamtbetragPool)}</td>
                          <td className="py-1 pr-3 text-neutral-500">{formatVerteilungsbasis(d)}</td>
                          <td className="py-1 pr-3 text-right tabular-nums text-neutral-300">{formatEuro(d.anteilJahr)}</td>
                          <td className="py-1 pr-3 text-right tabular-nums text-white">
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
                        <td className="py-1 pr-3 text-right tabular-nums text-white">{formatEuro(summeDetails)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {p.mietvertragId && (
                <PositionBearbeitenForm
                  positionId={p.id}
                  berechnet={details.length > 0}
                  offen={details.length === 0}
                  initialZeitraumVon={toDateInputValue(p.zeitraumVon)}
                  initialZeitraumBis={toDateInputValue(p.zeitraumBis)}
                  initialKostenanteil={p.kostenanteilGesamt}
                  initialVorauszahlung={p.vorauszahlungGesamt}
                />
              )}
            </td>
          </tr>
        );
      }}
    />
  );
}
