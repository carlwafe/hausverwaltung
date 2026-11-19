"use client";

import { useActionState, type ReactNode } from "react";
import { updateObjekt } from "./actions";
import { DateInput } from "@/components/date-input";
import { toDateInputValue } from "@/lib/date-utils";

type Objekt = {
  name: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  beschreibung: string | null;
  telefonMieter: string | null;
  emailVerwaltung: string | null;
  emailMieter: string | null;
  sepaGlaeubigerName: string | null;
  sepaGlaeubigerAnschrift: string | null;
  sepaGlaeubigerId: string | null;
  mietkontoInhaber: string | null;
  mietkontoIban: string | null;
  mietkontoBic: string | null;
  mietkontoBank: string | null;
  buchhaltungAb: Date | string | null;
  kontostandAnkerDatum: Date | string | null;
  kontostandAnkerBetrag: string | null;
};

// Einheitliche Höhe für Eingabefelder (h-10).
const FELD = "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";
const LABEL = "mb-1 block text-sm font-medium";

export function ObjektForm({ initial }: { initial: Objekt }) {
  const [error, formAction, pending] = useActionState(updateObjekt, null);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Abschnitt titel="Objekt">
            <div>
              <label className={LABEL} htmlFor="name">
                Name
              </label>
              <input id="name" name="name" required defaultValue={initial.name} className={FELD} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 min-w-0">
                <label className={LABEL} htmlFor="strasse">
                  Straße
                </label>
                <input id="strasse" name="strasse" required defaultValue={initial.strasse} className={FELD} />
              </div>
              <div className="min-w-0">
                <label className={LABEL} htmlFor="hausnummer">
                  Nr.
                </label>
                <input id="hausnummer" name="hausnummer" required defaultValue={initial.hausnummer} className={FELD} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="min-w-0">
                <label className={LABEL} htmlFor="plz">
                  PLZ
                </label>
                <input id="plz" name="plz" required defaultValue={initial.plz} className={FELD} />
              </div>
              <div className="col-span-2 min-w-0">
                <label className={LABEL} htmlFor="ort">
                  Ort
                </label>
                <input id="ort" name="ort" required defaultValue={initial.ort} className={FELD} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="beschreibung">
                Beschreibung
              </label>
              <textarea
                id="beschreibung"
                name="beschreibung"
                rows={3}
                defaultValue={initial.beschreibung ?? ""}
                className="w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
          </Abschnitt>

          <Abschnitt titel="Kontakt">
            <div>
              <label className={LABEL} htmlFor="telefonMieter">
                Telefon für Mieter
              </label>
              <input
                id="telefonMieter"
                name="telefonMieter"
                type="tel"
                defaultValue={initial.telefonMieter ?? ""}
                className={FELD}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={LABEL} htmlFor="emailVerwaltung">
                  E-Mail für Verwaltungssachen
                </label>
                <input
                  id="emailVerwaltung"
                  name="emailVerwaltung"
                  type="email"
                  defaultValue={initial.emailVerwaltung ?? ""}
                  className={FELD}
                />
              </div>
              <div className="min-w-0">
                <label className={LABEL} htmlFor="emailMieter">
                  E-Mail für Mieter
                </label>
                <input
                  id="emailMieter"
                  name="emailMieter"
                  type="email"
                  defaultValue={initial.emailMieter ?? ""}
                  className={FELD}
                />
              </div>
            </div>
          </Abschnitt>

          <Abschnitt titel="Buchhaltung">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateInput
                id="buchhaltungAb"
                name="buchhaltungAb"
                label="Buchhaltung erfasst ab"
                defaultValue={toDateInputValue(initial.buchhaltungAb)}
              />
            </div>
            <p className="text-xs text-neutral-500">
              Soll/Ist-Vergleiche (Offene Posten, Dashboard) rechnen erst ab diesem Datum bzw. ab einem späteren
              Mietbeginn. Einzelne Mietverträge können einen früheren eigenen Stichtag haben.
            </p>
            <div className="grid grid-cols-1 gap-4 border-t border-neutral-800 pt-4 sm:grid-cols-2">
              <DateInput
                id="kontostandAnkerDatum"
                name="kontostandAnkerDatum"
                label="Kontostand-Anker: Datum"
                defaultValue={toDateInputValue(initial.kontostandAnkerDatum)}
              />
              <div className="min-w-0">
                <label className={LABEL} htmlFor="kontostandAnkerBetrag">
                  Kontostand an diesem Tag (€)
                </label>
                <input
                  id="kontostandAnkerBetrag"
                  name="kontostandAnkerBetrag"
                  type="number"
                  step="0.01"
                  defaultValue={initial.kontostandAnkerBetrag ?? ""}
                  className={FELD}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Optionaler Referenzpunkt der Kontostand-Seite (z.B. Saldo laut Kontoauszug); von hier wird der Verlauf aus
              allen Buchungen vor- und zurückgerechnet. Gilt nur, solange keine Bank-Salden aus dem CAMT-Import gespeichert
              sind.
            </p>
          </Abschnitt>
        </div>

        <div className="space-y-6">
          <Abschnitt titel="Bankverbindung Mietkonto">
            <div>
              <label className={LABEL} htmlFor="mietkontoInhaber">
                Kontoinhaber
              </label>
              <input
                id="mietkontoInhaber"
                name="mietkontoInhaber"
                defaultValue={initial.mietkontoInhaber ?? ""}
                className={FELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="mietkontoIban">
                IBAN
              </label>
              <input
                id="mietkontoIban"
                name="mietkontoIban"
                defaultValue={initial.mietkontoIban ?? ""}
                placeholder="DE00 0000 0000 0000 0000 00"
                className={`${FELD} font-mono`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className={LABEL} htmlFor="mietkontoBic">
                  BIC (optional)
                </label>
                <input id="mietkontoBic" name="mietkontoBic" defaultValue={initial.mietkontoBic ?? ""} className={`${FELD} font-mono`} />
              </div>
              <div className="min-w-0">
                <label className={LABEL} htmlFor="mietkontoBank">
                  Bank (optional)
                </label>
                <input id="mietkontoBank" name="mietkontoBank" defaultValue={initial.mietkontoBank ?? ""} className={FELD} />
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Konto, auf das die Mieter zahlen; erscheint z.B. im Anpassungsschreiben. Die IBAN wird geprüft und ohne
              Leerzeichen gespeichert; keine Wirkung auf Buchungen.
            </p>
          </Abschnitt>

          <Abschnitt titel="SEPA-Lastschrift (Mandate)">
            <div>
              <label className={LABEL} htmlFor="sepaGlaeubigerName">
                Gläubiger (Vermieterin)
              </label>
              <input
                id="sepaGlaeubigerName"
                name="sepaGlaeubigerName"
                defaultValue={initial.sepaGlaeubigerName ?? ""}
                className={FELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="sepaGlaeubigerAnschrift">
                Anschrift des Gläubigers
              </label>
              <input
                id="sepaGlaeubigerAnschrift"
                name="sepaGlaeubigerAnschrift"
                defaultValue={initial.sepaGlaeubigerAnschrift ?? ""}
                className={FELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="sepaGlaeubigerId">
                Gläubiger-Identifikationsnummer
              </label>
              <input
                id="sepaGlaeubigerId"
                name="sepaGlaeubigerId"
                defaultValue={initial.sepaGlaeubigerId ?? ""}
                placeholder="DE00ZZZ00000000000"
                className={`${FELD} font-mono`}
              />
            </div>
            <p className="text-xs text-neutral-500">
              Vorbelegung der Lastschriftmandate. Gläubiger ist die Vermieterin, der Gläubiger-ID und Mietkonto gehören;
              die Gläubiger-ID wird geprüft.
            </p>
          </Abschnitt>
        </div>
      </div>

      {/* Speichern bleibt beim Scrollen am unteren Rand sichtbar. */}
      <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-white px-5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h2>
      {children}
    </section>
  );
}
