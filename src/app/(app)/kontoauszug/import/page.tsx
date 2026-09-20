"use client";

import { useActionState, useCallback, useState } from "react";
import Link from "next/link";
import { previewImport, ladeBestehendeImportSets, type BestehendeImportSets } from "./actions";
import { BuchungenTabelle } from "./buchungen-tabelle";

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
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Export deines Kontos einmal hochladen — jede Buchung erscheint unten in
        einer Tabelle mit einer vorgeschlagenen Buchungsart (Miete, Kosten, Mietweiterleitung,
        Kaution, Nebenkostenausgleich, …), die du pro Zeile bestätigen oder ändern kannst.
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
                accept=".csv,.xlsx,.xls"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
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

          <BuchungenTabelle
            key={preview.importBatchId}
            zeilen={preview.zeilen}
            buchungsarten={preview.buchungsarten}
            mietvertragKandidaten={preview.mietvertragKandidaten}
            kostenarten={preview.kostenarten}
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
