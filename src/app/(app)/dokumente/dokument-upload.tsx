"use client";

import { useActionState, useState } from "react";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { ART_OPTIONEN, ORDNER_VORSCHLAEGE, formatBytes } from "@/lib/dokumente-anzeige";
import { MAX_DOKUMENT_GROESSE_BYTES, ermittleZuGrosseDateien } from "@/lib/upload-limits";
import { uploadDokumentZentral } from "./actions";

type Option = { id: string; label: string };

const ZIELE = [
  { key: "allgemein", label: "Unkategorisiert (Ordner)" },
  { key: "mietvertraege", label: "Mieterakte (Mietvertrag)" },
  { key: "einheiten", label: "Einheit (Foto)" },
  { key: "dienstleister", label: "Dienstleister" },
  { key: "tickets", label: "Ticket" },
] as const;

type ZielKey = (typeof ZIELE)[number]["key"];

// Feste Höhe: native Auswahlfelder rendern sonst kleiner als Text- und Datumsfelder (38 px = Standard der App).
const FELD = "h-[38px] rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white";

export function DokumentUpload({
  optionen,
  ordnerNamen,
  vorgabe,
}: {
  optionen: Record<Exclude<ZielKey, "allgemein">, Option[]>;
  /** Vorhandene Ordner im Bereich „Unkategorisiert“ (Vorschläge beim Tippen). */
  ordnerNamen: string[];
  /** Aus dem gerade geöffneten Ordner: Bereich und (je nach Bereich) Bezug bzw. Ordnername. */
  vorgabe: { bereich: ZielKey; bezugId: string; ordner: string };
}) {
  const [error, formAction, pending] = useActionState(uploadDokumentZentral, null);
  const [bereich, setBereich] = useState<ZielKey>(vorgabe.bereich);
  const [bezugId, setBezugId] = useState(vorgabe.bezugId);
  const [ordner, setOrdner] = useState(vorgabe.ordner);
  const [groessenFehler, setGroessenFehler] = useState<string | null>(null);

  const maxMb = MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024);

  // Vorhandene Ordner zuerst, dann die noch nicht vorhandenen Standardvorschläge (ohne Dubletten,
  // Groß-/Kleinschreibung egal).
  const vorhanden = new Set(ordnerNamen.map((n) => n.toLowerCase()));
  const ordnerVorschlaege = [...ordnerNamen, ...ORDNER_VORSCHLAEGE.filter((n) => !vorhanden.has(n.toLowerCase()))];

  function pruefeGroesse(e: React.ChangeEvent<HTMLInputElement>) {
    const zuGross = ermittleZuGrosseDateien(e.target.files, MAX_DOKUMENT_GROESSE_BYTES);
    if (zuGross.length > 0) {
      setGroessenFehler(`Maximal ${maxMb} MB pro Datei: ${zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.`);
      e.target.value = "";
    } else {
      setGroessenFehler(null);
    }
  }

  return (
    <form action={formAction} className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Dokument hochladen</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Ablegen bei</label>
          <select
            name="bereich"
            value={bereich}
            onChange={(e) => {
              setBereich(e.target.value as ZielKey);
              setBezugId("");
            }}
            className={FELD}
          >
            {ZIELE.map((z) => (
              <option key={z.key} value={z.key}>
                {z.label}
              </option>
            ))}
          </select>
        </div>

        {bereich === "allgemein" ? (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Ordner (optional)</label>
            <input
              name="ordner"
              list="dokument-ordner"
              value={ordner}
              onChange={(e) => setOrdner(e.target.value)}
              maxLength={80}
              placeholder="z.B. Versicherungen"
              className={`${FELD} w-56`}
            />
            <datalist id="dokument-ordner">
              {ordnerVorschlaege.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
        ) : (
          <div className="w-80 max-w-full">
            <label className="mb-1 block text-xs text-neutral-400">
              {ZIELE.find((z) => z.key === bereich)?.label}
            </label>
            <input type="hidden" name="bezugId" value={bezugId} />
            <MietvertragAuswahl
              key={bereich}
              kandidaten={optionen[bereich]}
              value={bezugId}
              onChange={setBezugId}
              leerLabel="Bitte wählen…"
              size="md"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Art (optional)</label>
          <select name="art" defaultValue="" className={FELD}>
            <option value="">–</option>
            {ART_OPTIONEN.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Belegdatum (optional)</label>
          <DateInput name="belegDatum" />
        </div>
        <input
          type="file"
          name="file"
          required
          onChange={pruefeGroesse}
          className="text-sm text-neutral-300 file:mr-3 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:text-white"
        />
        <button
          type="submit"
          disabled={pending || groessenFehler !== null}
          className="h-[38px] rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Lädt hoch…" : "Hochladen"}
        </button>
      </div>
      {bereich === "allgemein" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500">Ordner wählen:</span>
          {ordnerVorschlaege.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setOrdner(n)}
              className={`rounded-full border px-2.5 py-1 ${
                ordner === n
                  ? "border-white text-white"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        Maximal {maxMb} MB pro Datei, eine Datei je Upload. Kostenbelege werden weiterhin an der jeweiligen Kostenposition
        hochgeladen (Kosten → Position) und erscheinen hier automatisch nach Jahr geordnet.
      </p>
      {groessenFehler && <p className="mt-2 text-sm text-red-400">{groessenFehler}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
