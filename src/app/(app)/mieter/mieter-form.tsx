"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { runFormAction, type FormAktion } from "@/lib/form-utils";

// Einheitliche Höhe für Eingabefelder und Auswahllisten (h-10).
const FELD = "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";

type Mieter = {
  anrede: string | null;
  vorname: string;
  nachname: string;
  email: string | null;
  handynummer: string | null;
  festnetznummer: string | null;
  anschriftStrasse: string | null;
  anschriftPlz: string | null;
  anschriftOrt: string | null;
  notizen: string | null;
};

export function MieterForm({
  initial,
  action,
  amtZahlt,
  abbrechenHref,
}: {
  initial?: Mieter;
  action: FormAktion;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
  // Aus dem Zahlungsweg der Mietverträge abgeleitet (nur Anzeige, nicht änderbar).
  amtZahlt?: boolean;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Abschnitt titel="Person">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="anrede">
                Anrede
              </label>
              <select id="anrede" name="anrede" defaultValue={initial?.anrede ?? ""} className={FELD}>
                <option value="">– keine (neutral: „Guten Tag Vorname Nachname“) –</option>
                <option value="FRAU">Frau</option>
                <option value="HERR">Herr</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="vorname">
                  Vorname <span className="font-normal text-neutral-500">(leer bei Firmen)</span>
                </label>
                <input id="vorname" name="vorname" defaultValue={initial?.vorname} className={FELD} />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="nachname">
                  Nachname <span className="font-normal text-neutral-500">(bzw. Firma)</span>
                </label>
                <input id="nachname" name="nachname" required defaultValue={initial?.nachname} className={FELD} />
              </div>
            </div>
          </Abschnitt>

          <Abschnitt titel="Kontakt">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                E-Mail
              </label>
              <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={FELD} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="handynummer">
                  Handynummer
                </label>
                <input id="handynummer" name="handynummer" defaultValue={initial?.handynummer ?? ""} className={FELD} />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="festnetznummer">
                  Festnetznummer
                </label>
                <input id="festnetznummer" name="festnetznummer" defaultValue={initial?.festnetznummer ?? ""} className={FELD} />
              </div>
            </div>
            {initial && (
              <p className="text-sm">
                <span className="text-neutral-400">Miete zahlt das Amt (Jobcenter/Kreis):</span>{" "}
                <span className={amtZahlt ? "text-blue-400" : "text-white"}>{amtZahlt ? "ja" : "nein"}</span>
                <span className="block text-xs text-neutral-500">
                  Ergibt sich aus dem Zahlungsweg „Amt zahlt“ eines laufenden oder geplanten Mietvertrags und wird dort
                  gepflegt.
                </span>
              </p>
            )}
          </Abschnitt>
        </div>

        <div className="space-y-6">
          <Abschnitt titel="Postanschrift (optional)">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="anschriftStrasse">
                Straße und Hausnummer
              </label>
              <input
                id="anschriftStrasse"
                name="anschriftStrasse"
                maxLength={120}
                defaultValue={initial?.anschriftStrasse ?? ""}
                className={FELD}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="anschriftPlz">
                  PLZ
                </label>
                <input id="anschriftPlz" name="anschriftPlz" maxLength={10} defaultValue={initial?.anschriftPlz ?? ""} className={FELD} />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-sm font-medium" htmlFor="anschriftOrt">
                  Ort
                </label>
                <input id="anschriftOrt" name="anschriftOrt" maxLength={80} defaultValue={initial?.anschriftOrt ?? ""} className={FELD} />
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Nur für Mieter, die nicht im Objekt wohnen (ausgezogene Mieter, externe Garagenmieter). Steht dann als
              Empfänger in den Schreiben, z.B. der Betriebskostenabrechnung.
            </p>
          </Abschnitt>

          <Abschnitt titel="Notizen">
            <textarea
              id="notizen"
              name="notizen"
              aria-label="Notizen"
              rows={8}
              defaultValue={initial?.notizen ?? ""}
              className="w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
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
        {abbrechenHref && (
          <Link
            href={abbrechenHref}
            className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm text-white hover:bg-neutral-900"
          >
            Abbrechen
          </Link>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h2>
      {children}
    </section>
  );
}
