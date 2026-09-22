"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { MietvertragForm } from "./mietvertrag-form";
import { DeleteButton } from "@/components/delete-button";

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

function Feld({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value}</p>
    </div>
  );
}

/**
 * Zeigt die Vertrags-Eckdaten standardmäßig als reinen Lesetext (die Seite ist mit dem
 * ausklappbaren Bearbeiten-Formular sonst schnell unübersichtlich) — erst nach Klick auf
 * "Bearbeiten" erscheint das bestehende MietvertragForm. Löschen bleibt in beiden Zuständen
 * möglich, "Bearbeiten" wird während des Bearbeitens zu "Abbrechen".
 */
export function EckdatenSektion({
  einheitLabel,
  mieterNamen,
  beginnText,
  endeText,
  kaltmieteText,
  nebenkostenText,
  mehrwertsteuerText,
  status,
  saldovortragText,
  kaution,
  letzteErhoehungText,
  deleteAction,
  formProps,
  mieterhoehungenSektion,
}: {
  einheitLabel: string;
  mieterNamen: string;
  beginnText: string;
  endeText: string;
  kaltmieteText: string;
  nebenkostenText: string;
  mehrwertsteuerText: string | null;
  status: string;
  saldovortragText: string;
  kaution: { betragText: string; anlageform: string; zinssatzText: string } | null;
  // Fliesstext-Hinweis auf die letzte Mieterhöhung (z.B. "Miete zuletzt zum 1.5.2026 auf 620,00 €
  // erhöht") — die volle Historie/Erfassung steht erst im Bearbeiten-Modus (mieterhoehungenSektion),
  // damit sie die Übersichtsseite nicht mehr dauerhaft belegt.
  letzteErhoehungText: string | null;
  deleteAction: () => Promise<void>;
  formProps: ComponentProps<typeof MietvertragForm>;
  mieterhoehungenSektion: ReactNode;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">Vertragsdaten</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBearbeiten((v) => !v)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900"
          >
            {bearbeiten ? "Abbrechen" : "Bearbeiten"}
          </button>
          <DeleteButton
            action={deleteAction}
            confirmText="Mietvertrag wirklich löschen? Zahlungen und Kaution werden mitgelöscht."
          />
        </div>
      </div>

      {bearbeiten ? (
        <div className="space-y-6">
          <MietvertragForm {...formProps} />
          {mieterhoehungenSektion}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Feld label="Einheit" value={einheitLabel} />
            <Feld label="Mieter" value={mieterNamen} />
            <Feld label="Mietbeginn" value={beginnText} />
            <Feld label="Mietende" value={endeText} />
            <Feld label="Kaltmiete" value={kaltmieteText} />
            <Feld label="NK-Vorauszahlung" value={nebenkostenText} />
            {mehrwertsteuerText && <Feld label="Mehrwertsteuer" value={mehrwertsteuerText} />}
            <Feld label="Status" value={STATUS_LABEL[status] ?? status} />
            <Feld label="Saldovortrag" value={saldovortragText} />
            {kaution && (
              <>
                <Feld label="Kaution" value={kaution.betragText} />
                <Feld label="Kaution-Anlageform" value={ANLAGEFORM_LABEL[kaution.anlageform] ?? kaution.anlageform} />
                <Feld label="Kaution-Zinssatz" value={kaution.zinssatzText} />
              </>
            )}
          </div>
          {letzteErhoehungText && (
            <p className="mt-4 text-xs text-neutral-400">
              {letzteErhoehungText} — Historie und Erfassung unter &bdquo;Bearbeiten&ldquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
