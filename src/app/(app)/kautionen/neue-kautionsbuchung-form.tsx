"use client";

import { DateInput } from "@/components/date-input";
import { useState, useTransition } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { erstelleKautionsbuchung, erfasseKautionEinbehalt } from "./actions";

type VirtuelleGutschrift = { id: string; label: string; datumISO: string | null };

const EINBEHALT_STATUS_OPTIONEN: { value: string; label: string }[] = [
  { value: "UNSTRITTIG", label: "Unstrittig" },
  { value: "STRITTIG_OFFEN", label: "Strittig — offen" },
  { value: "STRITTIG_BESTAETIGT", label: "Strittig — bestätigt" },
  { value: "STRITTIG_VERWORFEN", label: "Strittig — verworfen" },
];

const KATEGORIE_OPTIONEN: { value: string; label: string }[] = [
  { value: "EINZAHLUNG_MIETER", label: "Einzahlung Mieter (eingehend)" },
  { value: "ANLAGE", label: "Anlage aufs Kautionskonto (ausgehend)" },
  { value: "AUFLOESUNG", label: "Auflösung vom Kautionskonto (eingehend)" },
  { value: "AUSZAHLUNG_MIETER", label: "Auszahlung Mieter (ausgehend)" },
  { value: "SONSTIGES", label: "Sonstiges (z.B. Korrektur)" },
  {
    value: "EINBEHALT",
    label: "Einbehalt (Kaution einbehalten, z.B. für einen Schaden)",
  },
  {
    value: "VERRECHNUNG_NK",
    label: "Verrechnung mit NK-Abrechnung (Kaution mit einer Nachzahlung verrechnet)",
  },
  {
    value: "VIRTUELLE_AUSZAHLUNG",
    label: "Virtuelle Auszahlung (kein Kontofluss, bereits über eine Kostenposition gebucht)",
  },
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
  virtuelleGutschriften,
}: {
  mietvertraege: { id: string; label: string }[];
  /** Kostenpositionen mit negativem Betrag (Gutschriften) — mögliche Gegenbuchungen für eine
   * virtuelle Auszahlung. */
  virtuelleGutschriften: VirtuelleGutschrift[];
}) {
  const [offen, setOffen] = useState(false);
  const [mietvertragId, setMietvertragId] = useState("");
  const [datum, setDatum] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [kostenpositionId, setKostenpositionId] = useState("");
  const [einbehaltStatus, setEinbehaltStatus] = useState("UNSTRITTIG");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Vorauswahl auf Kostenpositionen vom selben Tag wie das oben eingetragene Buchungsdatum,
  // solange noch nicht gesucht wurde — Volltextsuche bleibt über alle Kandidaten möglich, siehe
  // MietvertragAuswahl. Fällt auf die volle Liste zurück, falls an diesem Tag nichts passt (z.B.
  // solange das Datum noch nicht ausgefüllt ist).
  const gutschriftenAmTag = datum ? virtuelleGutschriften.filter((g) => g.datumISO === datum) : [];

  const istEinbehalt = kategorie === "EINBEHALT";
  const istNkVerrechnung = kategorie === "VERRECHNUNG_NK";
  // Beide erzeugen intern einen KautionEinbehalt — die Verrechnung ist ein unstrittiger Einbehalt
  // mit Bezug auf ein Abrechnungsjahr.
  const erzeugtEinbehalt = istEinbehalt || istNkVerrechnung;

  function submit(formData: FormData) {
    startTransition(async () => {
      // Ein Einbehalt ist keine einzelne Kontobuchung, sondern ein begründeter Posten mit
      // Streit-Status (erzeugt bei UNSTRITTIG/STRITTIG_BESTAETIGT selbst die Journal-Buchung) —
      // deshalb eigene Action, aber derselbe Eingabeweg.
      if (erzeugtEinbehalt) {
        const text = String(formData.get("verwendungszweck") ?? "").trim();
        formData.set(
          "positionText",
          text || `Verrechnung mit Nebenkostenabrechnung ${formData.get("nkJahr") ?? ""}`.trim(),
        );
        formData.set("betrag", String(Math.abs(Number(formData.get("betrag")))));
        formData.set("status", istNkVerrechnung ? "UNSTRITTIG" : einbehaltStatus);
      }
      const ergebnis = erzeugtEinbehalt
        ? await erfasseKautionEinbehalt(null, formData)
        : await erstelleKautionsbuchung(null, formData);
      if (ergebnis) {
        setFehler(ergebnis);
        return;
      }
      setFehler(null);
      setMietvertragId("");
      setDatum("");
      setKategorie("");
      setKostenpositionId("");
      setEinbehaltStatus("UNSTRITTIG");
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
        Auch für Fälle ohne eigene Kontobuchung — z.B. ein einbehaltener Kautionsrest, der anderweitig
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
            <DateInput id="datum" name="datum" label="Datum" labelClassName="text-xs font-normal text-neutral-400" required value={datum} onChange={setDatum} />
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
              placeholder={erzeugtEinbehalt ? "einbehaltener Betrag, z.B. 302" : "z.B. -519 für ausgehend"}
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
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
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
        {kategorie === "VIRTUELLE_AUSZAHLUNG" && (
          <div>
            <input type="hidden" name="verknuepfteKostenpositionId" value={kostenpositionId} />
            <label className="mb-1 block text-xs text-neutral-400">
              Verknüpfte Kostenposition (optional)
            </label>
            <p className="mb-1 text-xs text-neutral-500">
              Zeigt zunächst nur Gutschriften vom selben Tag — zum Suchen einfach tippen.
            </p>
            <MietvertragAuswahl
              kandidaten={virtuelleGutschriften}
              defaultKandidaten={gutschriftenAmTag.length > 0 ? gutschriftenAmTag : undefined}
              value={kostenpositionId}
              onChange={setKostenpositionId}
              leerLabel="– keine –"
              size="md"
            />
          </div>
        )}
        {istEinbehalt && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="einbehalt-status">
              Status
            </label>
            <select
              id="einbehalt-status"
              value={einbehaltStatus}
              onChange={(e) => setEinbehaltStatus(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            >
              {EINBEHALT_STATUS_OPTIONEN.map((o) => (
                <option key={o.value} value={o.value} className="bg-neutral-900 text-white">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {istNkVerrechnung && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="nkJahr">
              Abrechnungsjahr der Nebenkostenabrechnung
            </label>
            <input
              id="nkJahr"
              name="nkJahr"
              type="number"
              min="2000"
              max="2100"
              required
              placeholder="z.B. 2025"
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="verwendungszweck">
            {istEinbehalt ? "Begründung" : "Notiz (optional)"}
          </label>
          <textarea
            id="verwendungszweck"
            name="verwendungszweck"
            required={istEinbehalt}
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
