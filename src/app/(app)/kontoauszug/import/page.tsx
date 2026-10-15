"use client";

import { useActionState, useCallback, useState } from "react";
import Link from "next/link";
import { previewImport, ladeBestehendeImportSets, type BestehendeImportSets } from "./actions";
import { BuchungenTabelle } from "./buchungen-tabelle";
import type { CamtPruefung } from "@/lib/import/camt";

const euro = (n: number | null) =>
  n === null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const datumDe = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "–");

// Ergebnis der Saldoprüfung bei CAMT-Import: Bank-Anfangssaldo + alle Buchungen = Bank-Endsaldo je Tag,
// und der Endsaldo eines Tages ist der Anfangssaldo des nächsten (sonst fehlt eine Datei).
function CamtPruefungBox({ p }: { p: CamtPruefung }) {
  const tageGeprueft = p.tage.filter((t) => t.stimmt !== null).length;
  const tageOk = p.tage.filter((t) => t.stimmt === true).length;
  const sauber = p.probleme.length === 0;
  return (
    <div className="mb-6 max-w-3xl rounded-md border border-neutral-700 bg-neutral-900/60 p-4 text-sm text-neutral-300">
      <p className={`font-medium ${sauber ? "text-green-400" : "text-amber-400"}`}>
        {sauber ? "✓ Saldoprüfung bestanden" : "Saldoprüfung: bitte prüfen"} — {p.dateien} Datei{p.dateien === 1 ? "" : "en"},{" "}
        {p.buchungen} Buchungen, {datumDe(p.von)} bis {datumDe(p.bis)}
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        Kontostand laut Bank: {euro(p.anfangssaldo)} am Anfang, {euro(p.endsaldo)} am Ende. {tageOk} von {tageGeprueft} Tagen:
        Anfangssaldo + Buchungen = Endsaldo
        {p.saldoKetteLueckenlos === true && "; Saldokette von Tag zu Tag lückenlos"}.
      </p>
      {p.probleme.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-400">
          {p.probleme.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function KontoauszugImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Startet leer und wird nach jedem Commit per ladeBestehendeImportSets() neu geladen — dadurch
  // verschwindet z.B. eine gerade importierte Buchung sofort aus den "bitte prüfen"-Zeilen, ohne
  // die Datei erneut hochzuladen. Solange noch kein Refresh gelaufen ist, wird unten auf
  // preview.bestehendeXxx zurückgegriffen (die ursprünglich beim Hochladen berechneten Listen).
  const [refreshedSets, setRefreshedSets] = useState<BestehendeImportSets | null>(null);
  const refreshBestehendeSets = useCallback(async () => {
    setRefreshedSets(await ladeBestehendeImportSets());
  }, []);

  const hasPreview = preview !== null && !("error" in preview);
  const bestehendeSets: BestehendeImportSets | null = hasPreview
    ? (refreshedSets ?? {
        bestehendeZahlungen: preview.bestehendeZahlungen,
        bestehendeZahlungenDatumBetrag: preview.bestehendeZahlungenDatumBetrag,
        bestehendeKosten: preview.bestehendeKosten,
        bestehendeMietweiterleitungen: preview.bestehendeMietweiterleitungen,
        bestehendeKautionsbuchungen: preview.bestehendeKautionsbuchungen,
        bestehendeNebenkostenausgleich: preview.bestehendeNebenkostenausgleich,
        bestehendeNichtZugeordnet: preview.bestehendeNichtZugeordnet,
        bestehendeRohdaten: preview.bestehendeRohdaten,
      })
    : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Kontoauszug importieren</h1>
        <Link href="/kontoauszug/importe" className="text-sm text-neutral-400 underline hover:text-white">
          Bisherige Importe verwalten
        </Link>
      </div>
      <p className="mb-2 max-w-2xl text-sm text-neutral-400">
        CSV-, Excel- oder CAMT-Export (XML) deines Kontos einmal hochladen — jede Buchung erscheint unten in
        einer Tabelle mit einer vorgeschlagenen Buchungsart (Miete, Kosten, Mietweiterleitung,
        Kaution, Nebenkostenausgleich, …), die du pro Zeile bestätigen oder ändern kannst.
      </p>
      <p className="mb-2 max-w-2xl text-xs text-neutral-500">
        CAMT (camt.052 Tagesumsätze oder camt.053 Kontoauszug, Version 001.08; 001.02 geht auch): bei
        Tagesdateien alle Dateien des Zeitraums auf einmal markieren. Die App prüft dabei die Kontostände
        der Bank (Anfangssaldo + Buchungen = Endsaldo, lückenlos von Tag zu Tag) und erkennt bereits
        importierte Buchungen auch an der eindeutigen Umsatz-ID der Bank.
      </p>
      <p className="mb-2 max-w-2xl text-xs text-neutral-500">
        Für unsichere Zeilen gibt es &bdquo;Offene Zeilen mit KI prüfen&ldquo;: Claude macht pro Zeile einen
        Vorschlag mit kurzer Begründung (Spalte &bdquo;KI-Einschätzung&ldquo;). Es wird nur auf Knopfdruck
        geprüft, IBANs werden nicht übertragen, und nichts wird automatisch zum Import ausgewählt.
      </p>
      <p className="mb-6 max-w-2xl text-xs text-neutral-500">
        Stadtwerke-Zahlungen sind pro Haus ein Saldo aus Schlussrechnung und neuen Abschlägen; der
        Verwendungszweck nennt oft die falsche Sparte (&bdquo;Allgemeinstrom + Wasser&ldquo;, &bdquo;Wasser +
        Gas&ldquo;). Kostenart am Betrag prüfen und die Kostenposition danach unter Kosten aufteilen.
      </p>
      <p className="mb-2 max-w-2xl text-xs text-neutral-500">
        &bdquo;M&ouml;gliche Doppelzahlung&ldquo; (Spalte Hinweis): Dieselbe Rechnungsnummer wurde bei
        gleichem Empf&auml;nger und Betrag schon gebucht oder steht zweimal in der Datei (h&ouml;chstens
        120 Tage auseinander). Nur ein Hinweis, nichts wird gesperrt: Bei einer echten Doppelzahlung
        die zweite Zeile nicht importieren (oder importieren und die R&uuml;ckzahlung sp&auml;ter als
        negative Kostenposition derselben Kostenart buchen). Abschl&auml;ge, Raten und Serien mit drei
        oder mehr gleichen Zahlungen werden nicht gemeldet; ohne Rechnungsnummer im Text wird
        nichts gepr&uuml;ft.
      </p>
      <p className="mb-6 max-w-2xl text-xs text-neutral-500">
        Von Hand prüfen: Die Rauchmelder-Wartung von Techem (Rechnung im Januar) gehört zum Vorjahr,
        der Verwendungszweck nennt aber keine Jahreszahl &mdash; Kostenjahr auf das Vorjahr setzen und
        die Kostengruppe je Haus-Gruppe wählen.
      </p>

      {!hasPreview && (
        <form action={previewAction} className="mb-8 flex items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="file">
              Datei
            </label>
            <div className="relative inline-block">
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,.xlsx,.xls,.xml"
                multiple
                required
                onChange={(e) => {
                  const dateien = Array.from(e.target.files ?? []);
                  setFileName(
                    dateien.length === 0 ? null : dateien.length === 1 ? dateien[0].name : `${dateien.length} Dateien ausgewählt`,
                  );
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white">
                {fileName ?? "Datei auswählen…"}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {previewPending ? "Analysiere…" : "Datei analysieren"}
          </button>
        </form>
      )}

      {preview && "error" in preview && <p className="mb-4 text-sm text-red-400">{preview.error}</p>}

      {hasPreview && bestehendeSets && (
        <div className="space-y-10">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-neutral-400 underline hover:text-white"
          >
            Andere Datei importieren
          </button>

          {preview.camtPruefung && <CamtPruefungBox p={preview.camtPruefung} />}

          <BuchungenTabelle
            key={preview.importBatchId}
            zeilen={preview.zeilen}
            buchungsarten={preview.buchungsarten}
            mietvertragKandidaten={preview.mietvertragKandidaten}
            kostenarten={preview.kostenarten}
            darlehenRaten={preview.darlehenRaten}
            darlehenListe={preview.darlehenListe}
            gebaeude={preview.gebaeude}
            einheiten={preview.einheiten}
            bestehendeSets={bestehendeSets}
            bestehendeNichtZugeordnetListe={bestehendeSets.bestehendeNichtZugeordnet}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />
        </div>
      )}
    </div>
  );
}
