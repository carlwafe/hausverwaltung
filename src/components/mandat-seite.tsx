"use client";

import Link from "next/link";
import { useState } from "react";
import { MandatBlatt } from "@/components/mandat-blatt";
import { GLAEUBIGER_LEER, mandatsreferenz, type MandatBlattDaten, type MandatGlaeubiger, type MandatVertrag } from "@/lib/sepa-mandat";

const eingabeKlasse = "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

const glaeubigerVollstaendig = (g: MandatGlaeubiger) => Object.values(g).every((v) => v.trim() !== "");

function GlaeubigerFelder({ wert, onChange }: { wert: MandatGlaeubiger; onChange: (w: MandatGlaeubiger) => void }) {
  const feld = (key: keyof MandatGlaeubiger, label: string) => (
    <div>
      <label className="mb-1 block text-xs text-neutral-400" htmlFor={`mandat-${key}`}>
        {label}
      </label>
      <input id={`mandat-${key}`} value={wert[key]} onChange={(e) => onChange({ ...wert, [key]: e.target.value })} className={eingabeKlasse} />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!glaeubigerVollstaendig(wert) && (
        <p className="text-xs text-amber-400 sm:col-span-2">
          Die Gläubiger-Angaben sind noch nicht vollständig hinterlegt — einmal unter{" "}
          <Link href="/objekt" className="underline">
            Objekt → SEPA-Lastschrift
          </Link>{" "}
          eintragen, dann sind sie hier vorausgefüllt. Für diesen Ausdruck lassen sie sich auch hier ausfüllen.
        </p>
      )}
      {feld("zahlungsempfaenger", "Zahlungsempfänger (Vermieterin)")}
      {feld("name", "Gläubiger (zieht ein)")}
      {feld("anschrift", "Anschrift des Gläubigers")}
      {feld("id", "Gläubiger-Identifikationsnummer")}
    </div>
  );
}

function VorausfuellenSchalter({ wert, onChange }: { wert: boolean; onChange: (w: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input type="checkbox" checked={wert} onChange={(e) => onChange(e.target.checked)} />
      Kontoinhaber und Anschrift mit den Mieterdaten vorausfüllen
    </label>
  );
}

const formatDatum = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));

function blattDaten(v: MandatVertrag, glaeubiger: MandatGlaeubiger, vorausfuellen: boolean, referenz = mandatsreferenz(v.einheit)): MandatBlattDaten {
  return {
    glaeubiger,
    referenz,
    mietobjekt: `${v.einheit}, ${v.strasse}, ${v.plzOrt}${v.beginn ? ` (Mietbeginn ${formatDatum(v.beginn)})` : ""}`,
    kontoinhaber: vorausfuellen ? v.mieterNamen : "",
    kontoinhaberAnschrift: vorausfuellen ? `${v.strasse}, ${v.plzOrt}` : "",
  };
}

/** Mandat für einen Mietvertrag: Angaben prüfen, Vorschau, drucken. */
export function MandatEinzel({ vertrag, glaeubiger: vorbelegung }: { vertrag: MandatVertrag; glaeubiger: MandatGlaeubiger }) {
  const [glaeubiger, setGlaeubiger] = useState<MandatGlaeubiger>(vorbelegung);
  const [vorausfuellen, setVorausfuellen] = useState(true);
  const [referenz, setReferenz] = useState(() => mandatsreferenz(vertrag.einheit));
  const [mietobjekt, setMietobjekt] = useState(() => blattDaten(vertrag, GLAEUBIGER_LEER, true).mietobjekt);

  const daten: MandatBlattDaten = { ...blattDaten(vertrag, glaeubiger, vorausfuellen, referenz), mietobjekt };

  return (
    <div>
      <div className="mb-6 space-y-3 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="mandat-referenz">
              Mandatsreferenz (höchstens 35 Zeichen, keine Namen; bei einem neuen Mandat für diese Einheit hochzählen)
            </label>
            <input id="mandat-referenz" value={referenz} maxLength={35} onChange={(e) => setReferenz(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="mandat-mietobjekt">
              Mietobjekt
            </label>
            <input id="mandat-mietobjekt" value={mietobjekt} onChange={(e) => setMietobjekt(e.target.value)} className={eingabeKlasse} />
          </div>
        </div>
        <VorausfuellenSchalter wert={vorausfuellen} onChange={setVorausfuellen} />
        <GlaeubigerFelder wert={glaeubiger} onChange={setGlaeubiger} />
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!glaeubigerVollstaendig(glaeubiger)}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          Mandat drucken / als PDF
        </button>
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500 print:hidden">Vorschau</p>
      <div className="overflow-x-auto">
        <div className="druckbereich mx-auto w-[210mm] shadow">
          <MandatBlatt daten={daten} letzte />
        </div>
      </div>
    </div>
  );
}

/** Mandate für mehrere Mietverträge in einem Druckvorgang, je Vertrag ein Blatt. */
export function MandatSammel({ vertraege, glaeubiger: vorbelegung }: { vertraege: MandatVertrag[]; glaeubiger: MandatGlaeubiger }) {
  const [glaeubiger, setGlaeubiger] = useState<MandatGlaeubiger>(vorbelegung);
  const [vorausfuellen, setVorausfuellen] = useState(true);

  return (
    <div>
      <div className="mb-6 space-y-3 print:hidden">
        <VorausfuellenSchalter wert={vorausfuellen} onChange={setVorausfuellen} />
        <GlaeubigerFelder wert={glaeubiger} onChange={setGlaeubiger} />
        <button
          type="button"
          onClick={() => window.print()}
          disabled={vertraege.length === 0 || !glaeubigerVollstaendig(glaeubiger)}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {vertraege.length} Mandat{vertraege.length === 1 ? "" : "e"} drucken / als PDF
        </button>
        <p className="text-xs text-neutral-500">
          Die Mandatsreferenzen werden je Einheit vergeben (z.B. „EUT-HS6WHG4-001“). Im Druckdialog „Kopf- und Fußzeilen“ ausschalten und als Format A4
          ohne Ränder wählen.
        </p>
      </div>

      {vertraege.length === 0 ? (
        <p className="text-sm text-neutral-400">Keine Mietverträge ausgewählt.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="druckbereich mx-auto w-[210mm] shadow">
            {vertraege.map((v, i) => (
              <MandatBlatt key={v.id} daten={blattDaten(v, glaeubiger, vorausfuellen)} letzte={i === vertraege.length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
