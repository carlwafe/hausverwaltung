"use client";

import { useState, useTransition } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { erstelleKautionsbuchung } from "./actions";

const KATEGORIE_OPTIONEN: { value: string; label: string }[] = [
  { value: "EINZAHLUNG_MIETER", label: "Einzahlung Mieter (eingehend)" },
  { value: "ANLAGE", label: "Anlage aufs Kautionskonto (ausgehend)" },
  { value: "AUFLOESUNG", label: "Auflösung vom Kautionskonto (eingehend)" },
  { value: "AUSZAHLUNG_MIETER", label: "Auszahlung Mieter (ausgehend)" },
  { value: "SONSTIGES", label: "Sonstiges (z.B. Korrektur)" },
];

/**
 * Absichtlich hinter einem eingeklappten Link versteckt (Vorbild: Aufteilen-Formulare bei
 * Kosten/Zahlungen) — für Fälle, die sich nicht aus einer einzelnen importierten Kontobuchung
 * ergeben, z.B. ein einbehaltener Kautionsrest, der teils für eine Reparatur verwendet und teils
 * in einer Nebenkostenabrechnung verrechnet wurde, ohne dass dafür je eine als "Kaution"
 * erkennbare Auszahlung überwiesen wurde.
 */
export function NeueKautionsbuchungForm({
  mietvertraege,
}: {
  mietvertraege: { id: string; label: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const [mietvertragId, setMietvertragId] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const ergebnis = await erstelleKautionsbuchung(null, formData);
      if (ergebnis) {
        setFehler(ergebnis);
        return;
      }
      setFehler(null);
      setMietvertragId("");
      setOffen(false);
    });
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mb-4 text-sm text-neutral-400 hover:text-white hover:underline"
      >
        Kautionsbuchung manuell hinzufügen…
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-3 text-sm font-medium text-white">Kautionsbuchung manuell hinzufügen</p>
      <p className="mb-3 text-xs text-neutral-500">
        Für Fälle ohne eigene Kontobuchung — z.B. ein einbehaltener Kautionsrest, der anderweitig
        verrechnet wurde (Reparaturkosten, Verrechnung in der Nebenkostenabrechnung).
      </p>
      <form action={submit} className="space-y-3">
        <input type="hidden" name="mietvertragId" value={mietvertragId} />
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Mietvertrag</label>
          <MietvertragAuswahl
            kandidaten={mietvertraege}
            value={mietvertragId}
            onChange={setMietvertragId}
            leerLabel="– wählen –"
            size="md"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="datum">
              Datum
            </label>
            <input
              id="datum"
              name="datum"
              type="date"
              required
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="betrag">
              Betrag (€)
            </label>
            <input
              id="betrag"
              name="betrag"
              type="number"
              step="0.01"
              required
              placeholder="z.B. -519 für ausgehend"
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="kategorie">
            Kategorie
          </label>
          <select
            id="kategorie"
            name="kategorie"
            required
            defaultValue=""
            className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {KATEGORIE_OPTIONEN.map((k) => (
              <option key={k.value} value={k.value} className="bg-neutral-900 text-white">
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="verwendungszweck">
            Notiz (optional)
          </label>
          <textarea
            id="verwendungszweck"
            name="verwendungszweck"
            rows={2}
            placeholder="z.B. 119 € Briefkasten-Reparatur, 400 € verrechnet in BK-Abrechnung 2025"
            className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        {fehler && <p className="text-sm text-red-400">{fehler}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={pending || !mietvertragId}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Hinzufügen"}
          </button>
          <button
            type="button"
            onClick={() => setOffen(false)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
