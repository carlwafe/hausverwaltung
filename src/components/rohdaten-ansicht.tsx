"use client";

import { useState } from "react";

// Gemeinsame Darstellung der Bankzeile (Buchung.rohdaten) für die aufgeklappte Tabellenzeile, den
// Dialog und die Handy-Karte im Import. Statt alle Felder gleich gewichtet in ein Raster zu
// stellen, ordnet sie nach Wichtigkeit: Kopf (Gegenseite, Betrag, Datum, Buchungstext),
// Verwendungszweck in voller Breite, Gruppen „Gegenkonto“ und „Lastschrift“, der Rest eingeklappt.
// Die Schlüssel sind die Spaltennamen des Bank-CSV bzw. die gleichnamigen Felder aus dem
// CAMT-Import (src/lib/import/camt.ts). Unbekannte Schlüssel (z.B. Altdaten des Vorverwalters)
// gehen nicht verloren, sie stehen unter „Weitere Angaben“.

const F = {
  name: "Beguenstigter/Zahlungspflichtiger",
  betrag: "Betrag",
  buchungstag: "Buchungstag",
  valuta: "Valutadatum",
  buchungstext: "Buchungstext",
  zweck: "Verwendungszweck",
  iban: "Kontonummer/IBAN",
  bic: "BIC (SWIFT-Code)",
  mandat: "Mandatsreferenz",
  glaeubigerId: "Glaeubiger ID",
  ursprungsbetrag: "Lastschrift Ursprungsbetrag",
  auslagen: "Auslagenersatz Ruecklastschrift",
  rueckgabegrund: "Rueckgabegrund",
  waehrung: "Waehrung",
  info: "Info",
} as const;

/** Nur für die Anzeige — die gespeicherten Schlüssel bleiben unverändert. */
const BEZEICHNUNG: Record<string, string> = {
  "Kundenreferenz (End-to-End)": "End-to-End-Referenz",
  Waehrung: "Währung",
};

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** "1.234,56" / "-184,00" / "70" → Zahl; null, wenn der Text keine Zahl ist. */
function zahl(text: string): number | null {
  const s = text.trim().replace(/\s/g, "");
  if (!/^[+-]?[\d.]*\d(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function euro(text: string): string {
  const n = zahl(text);
  return n === null ? text : EURO.format(n);
}

/** "3.11.26" / "9.9.2024" → "03.11.2026"; alles andere unverändert. */
function datum(text: string): string {
  const m = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return text;
  return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3].length === 2 ? `20${m[3]}` : m[3]}`;
}

/** "FOLGELASTSCHRIFT" → "Folgelastschrift" (die Bank liefert den Buchungstext in Großbuchstaben). */
function buchungstextLesbar(text: string): string {
  return text.toLowerCase().replace(/(^|[\s./-])(\p{L})/gu, (_, vor: string, b: string) => vor + b.toUpperCase());
}

const IBAN_MUSTER = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

function KopierKnopf({ text }: { text: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setKopiert(true);
            setTimeout(() => setKopiert(false), 1500);
          })
          .catch(() => {});
      }}
      title="IBAN kopieren"
      aria-label="IBAN kopieren"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-white"
    >
      {kopiert ? (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 text-green-400">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
          <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
          <path d="M13 4.5V4A1.5 1.5 0 0 0 11.5 2.5H4A1.5 1.5 0 0 0 2.5 4v7.5A1.5 1.5 0 0 0 4 13h.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function Gruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-neutral-500">{titel}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Feld({ name, wert }: { name: string; wert: string }) {
  return (
    <div className="[overflow-wrap:anywhere]">
      <span className="text-neutral-500">{name} </span>
      <span className="text-neutral-200">{wert}</span>
    </div>
  );
}

function Raster({ eintraege, schmal }: { eintraege: [string, string][]; schmal: boolean }) {
  return (
    <dl className={`grid grid-cols-2 gap-x-6 gap-y-1.5 ${schmal ? "" : "sm:grid-cols-3"}`}>
      {eintraege.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-neutral-500">{BEZEICHNUNG[key] ?? key}</dt>
          <dd className="text-neutral-200 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RohdatenAnsicht({
  rohdaten,
  schmal = false,
}: {
  rohdaten: Record<string, string>;
  /** Für Dialog und Handy-Karte: Gruppen untereinander statt nebeneinander. */
  schmal?: boolean;
}) {
  const wert = (key: string) => (rohdaten[key] ?? "").trim();

  const name = wert(F.name);
  const betragText = wert(F.betrag);
  const betrag = betragText ? zahl(betragText) : null;
  const buchungstag = wert(F.buchungstag);
  const valuta = wert(F.valuta);
  const buchungstext = wert(F.buchungstext);
  const zweck = wert(F.zweck);
  const iban = wert(F.iban).replace(/\s/g, "");
  const bic = wert(F.bic);
  const mandat = wert(F.mandat);
  const glaeubigerId = wert(F.glaeubigerId);
  const ursprungsbetrag = wert(F.ursprungsbetrag);
  const auslagen = wert(F.auslagen);
  const rueckgabegrund = wert(F.rueckgabegrund);

  const hatKopf = Boolean(name || betragText || buchungstag || buchungstext || zweck);
  const hatGegenkonto = Boolean(iban || bic);
  const hatLastschrift = Boolean(mandat || glaeubigerId || ursprungsbetrag || auslagen || rueckgabegrund);

  // Alles, was oben nicht schon steht. Nichtssagendes fällt weg: Währung EUR, "Umsatz gebucht".
  const obenGezeigt = new Set<string>(Object.values(F));
  const rest = Object.entries(rohdaten).filter(([key, value]) => {
    if (!value || !String(value).trim()) return false;
    if (key === F.waehrung) return value.trim().toUpperCase() !== "EUR";
    if (key === F.info) return value.trim() !== "Umsatz gebucht";
    return !obenGezeigt.has(key);
  });

  // Bankzeilen ohne die üblichen Felder (Altdaten): das Raster offen zeigen statt eingeklappt.
  if (!hatKopf && !hatGegenkonto && !hatLastschrift) {
    return <div className="text-xs">{rest.length > 0 ? <Raster eintraege={rest} schmal={schmal} /> : <span className="text-neutral-500">Keine Angaben.</span>}</div>;
  }

  const datumZeile = [
    buchungstag && datum(buchungstag),
    valuta && datum(valuta) !== datum(buchungstag) ? `Wertstellung ${datum(valuta)}` : "",
  ].filter(Boolean);

  return (
    <div className="text-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-white [overflow-wrap:anywhere]">{name || "Ohne Namen"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-neutral-400">
            {datumZeile.length > 0 && <span>{datumZeile.join(" · ")}</span>}
            {buchungstext && <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">{buchungstextLesbar(buchungstext)}</span>}
          </div>
        </div>
        {betragText && (
          <div
            className={`whitespace-nowrap text-sm font-medium tabular-nums ${betrag === null ? "text-white" : betrag < 0 ? "text-red-400" : "text-green-400"}`}
          >
            {betrag === null ? betragText : EURO.format(betrag)}
          </div>
        )}
      </div>

      {zweck && <p className="mt-3 text-sm leading-relaxed text-neutral-200 [overflow-wrap:anywhere]">{zweck}</p>}

      {(hatGegenkonto || hatLastschrift) && (
        <div className={`mt-3 grid gap-x-8 gap-y-3 border-t border-neutral-800 pt-3 ${schmal ? "" : "sm:grid-cols-2"}`}>
          {hatGegenkonto && (
            <Gruppe titel="Gegenkonto">
              {iban && (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-neutral-200 [overflow-wrap:anywhere]">
                    {IBAN_MUSTER.test(iban) ? iban.replace(/(.{4})(?=.)/g, "$1 ") : iban}
                  </span>
                  <KopierKnopf text={iban} />
                </div>
              )}
              {bic && <div className="text-neutral-400">{bic}</div>}
            </Gruppe>
          )}
          {hatLastschrift && (
            <Gruppe titel="Lastschrift">
              {mandat && <Feld name="Mandat" wert={mandat} />}
              {glaeubigerId && <Feld name="Gläubiger-ID" wert={glaeubigerId} />}
              {ursprungsbetrag && <Feld name="Ursprungsbetrag" wert={euro(ursprungsbetrag)} />}
              {auslagen && <Feld name="Auslagenersatz Rücklastschrift" wert={euro(auslagen)} />}
              {rueckgabegrund && <Feld name="Rückgabegrund" wert={rueckgabegrund} />}
            </Gruppe>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <details className="mt-3 border-t border-neutral-800 pt-3">
          <summary className="cursor-pointer select-none text-neutral-400 hover:text-white">Weitere Angaben</summary>
          <div className="mt-2">
            <Raster eintraege={rest} schmal={schmal} />
          </div>
        </details>
      )}
    </div>
  );
}
