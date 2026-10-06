"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/dokumente-anzeige";
import { istVerkleinerbar, verkleinereDatei } from "@/lib/datei-verkleinern";

// Ersetzt die Auswahl des Dateifelds (eigene Funktion, weil das Feld ein DOM-Element im State ist).
function setzeDateien(feld: HTMLInputElement, dateien: FileList) {
  feld.files = dateien;
}

/**
 * Größenprüfung für ein Datei-Eingabefeld: meldet zu große Dateien, sperrt solange den Upload und
 * bietet bei PDF/Bildern „Verkleinern“ an (im Browser, siehe datei-verkleinern.ts). Die gewählte
 * Datei bleibt dabei im Feld stehen und wird durch die verkleinerte Fassung ersetzt.
 * Verwendung: `onChange={p.onChange}` am <input type="file">,
 * `disabled={… || p.blockiert}` am Absende-Knopf, `<DateiGroesseWarnung {...p.warnung} maxBytes={…} />` darunter.
 */
export function useDateiGroesse(maxBytes: number) {
  // Das Eingabefeld merkt sich die Prüfung beim Ändern (als State statt Ref, damit es beim Rendern
  // nicht gelesen werden muss).
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [zuGross, setZuGross] = useState<File[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  function pruefe(feld: HTMLInputElement) {
    setZuGross([...(feld.files ?? [])].filter((f) => f.size > maxBytes));
  }

  async function verkleinern() {
    if (!input?.files) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      const ersatz = new DataTransfer();
      for (const f of input.files) {
        ersatz.items.add(f.size > maxBytes && istVerkleinerbar(f) ? await verkleinereDatei(f, maxBytes) : f);
      }
      setzeDateien(input, ersatz.files);
      pruefe(input);
      if ([...ersatz.files].some((f) => f.size > maxBytes)) {
        setMeldung("Auch verkleinert ist die Datei noch zu groß — bitte mit einem anderen Programm weiter verkleinern.");
      }
    } catch (err) {
      setMeldung(err instanceof Error ? err.message : "Das Verkleinern ist fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  }

  return {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target);
      setMeldung(null);
      pruefe(e.target);
    },
    /** Absenden sperren: Datei zu groß oder Verkleinerung läuft. */
    blockiert: zuGross.length > 0 || laeuft,
    /** Props für <DateiGroesseWarnung> (ohne maxBytes). */
    warnung: { zuGross, laeuft, meldung, onVerkleinern: verkleinern },
  };
}

export function DateiGroesseWarnung({
  zuGross,
  laeuft,
  meldung,
  onVerkleinern,
  maxBytes,
}: {
  zuGross: File[];
  laeuft: boolean;
  meldung: string | null;
  onVerkleinern: () => void;
  maxBytes: number;
}) {
  if (zuGross.length === 0 && !meldung) return null;
  const kannVerkleinern = zuGross.some(istVerkleinerbar);

  return (
    <div className="mt-2 text-sm">
      {zuGross.length > 0 && (
        <p className="text-red-400">
          Dateien dürfen maximal {maxBytes / (1024 * 1024)} MB groß sein: {zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.
        </p>
      )}
      {kannVerkleinern && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onVerkleinern}
            disabled={laeuft}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
          >
            {laeuft ? "Verkleinere…" : "Datei verkleinern"}
          </button>
          <span className="text-xs text-neutral-500">
            Läuft im Browser, die Datei verlässt dein Gerät nicht. Seiten werden als Bilder neu aufgebaut — der Text ist
            danach nicht mehr durchsuchbar.
          </span>
        </div>
      )}
      {meldung && <p className="mt-1 text-red-400">{meldung}</p>}
    </div>
  );
}
