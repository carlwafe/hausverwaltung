"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { DateInput } from "@/components/date-input";
import { runFormAction, type FormAktion } from "@/lib/form-utils";

type Typ = "HANDWERKER" | "SONSTIGE";

type Dienstleister = {
  typ: Typ;
  name: string;
  beschreibung: string | null;
  ansprechpartner: string | null;
  telefon: string | null;
  email: string | null;
  adresse: string | null;
  suchbegriffe: string;
  kostenartIds: string[];
  iban: string | null;
  notiz: string | null;
  aktiv: boolean;
  verwaltungInformiertAm: Date | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

// Einzeilige Felder und Auswahllisten einheitlich h-10; mehrzeilige Felder mit Innenabstand.
const inputClass =
  "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";
const textareaClass =
  "w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";
const labelClass = "mb-1 block text-sm font-medium";

export function DienstleisterForm({
  initial,
  standardTyp = "SONSTIGE",
  kostenarten,
  action,
  abbrechenHref,
}: {
  initial?: Dienstleister;
  standardTyp?: Typ;
  kostenarten: { id: string; label: string }[];
  action: FormAktion;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  // Beim Öffnen gewählte Kostenarten oben, damit sie ohne Scrollen in der Liste sichtbar sind (sonst alphabetisch).
  const gewaehlt = new Set(initial?.kostenartIds ?? []);
  const kostenartenSortiert = [...kostenarten.filter((k) => gewaehlt.has(k.id)), ...kostenarten.filter((k) => !gewaehlt.has(k.id))];

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Abschnitt titel="Dienstleister">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={labelClass} htmlFor="typ">
                  Typ
                </label>
                <select id="typ" name="typ" defaultValue={initial?.typ ?? standardTyp} className={inputClass}>
                  <option value="HANDWERKER" className="bg-neutral-900">
                    Handwerker (Elektriker, Sanitär, Tischler …)
                  </option>
                  <option value="SONSTIGE" className="bg-neutral-900">
                    Sonstiger Dienstleister (Verwaltung, Versorger, Versicherung …)
                  </option>
                </select>
              </div>
              <div className="min-w-0">
                <label className={labelClass} htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  defaultValue={initial?.name}
                  placeholder="z.B. Elektro-Service Knoop GbR"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="beschreibung">
                Beschreibung
              </label>
              <input
                id="beschreibung"
                name="beschreibung"
                defaultValue={initial?.beschreibung ?? ""}
                placeholder="z.B. Elektriker, Notdienst"
                className={inputClass}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="aktiv" defaultChecked={initial?.aktiv ?? true} />
                Aktiv (wird aktuell genutzt)
              </label>
              <p className="mt-1 text-xs text-neutral-500">
                Inaktive stehen in der Liste weiter unten (z.B. nach einem Wechsel); die Zuordnung beim Import gilt
                weiter, damit ältere Kontoauszüge zugeordnet werden.
              </p>
            </div>
          </Abschnitt>

          <Abschnitt titel="Kontakt">
            <div>
              <label className={labelClass} htmlFor="ansprechpartner">
                Ansprechpartner
              </label>
              <input
                id="ansprechpartner"
                name="ansprechpartner"
                defaultValue={initial?.ansprechpartner ?? ""}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={labelClass} htmlFor="telefon">
                  Telefon
                </label>
                <input id="telefon" name="telefon" type="tel" defaultValue={initial?.telefon ?? ""} className={inputClass} />
              </div>
              <div className="min-w-0">
                <label className={labelClass} htmlFor="email">
                  E-Mail
                </label>
                <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="adresse">
                Adresse
              </label>
              <textarea id="adresse" name="adresse" rows={2} defaultValue={initial?.adresse ?? ""} className={textareaClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="iban">
                IBAN
              </label>
              <input id="iban" name="iban" defaultValue={initial?.iban ?? ""} className={`${inputClass} font-mono`} />
            </div>
          </Abschnitt>
        </div>

        <div className="space-y-6">
          <Abschnitt titel="Zuordnung beim Kosten-Import (optional)">
            <div>
              <label className={labelClass} htmlFor="suchbegriffe">
                Suchbegriffe
              </label>
              <textarea
                id="suchbegriffe"
                name="suchbegriffe"
                rows={3}
                defaultValue={initial?.suchbegriffe}
                placeholder={"stadtwerke eutin\nSWE Eutin"}
                className={textareaClass}
              />
              <p className="mt-1 text-xs text-neutral-500">
                Ein Begriff pro Zeile (mind. 3 Zeichen), gesucht in Empfänger und Verwendungszweck, ohne Beachtung von
                Groß-/Kleinschreibung und Umlauten. Ohne Suchbegriffe wird nichts automatisch zugeordnet.
              </p>
            </div>

            <fieldset>
              <legend className="mb-1 block text-sm font-medium">Kostenarten (mehrere möglich)</legend>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-neutral-700 p-2">
                {kostenartenSortiert.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="kostenartIds"
                      value={k.id}
                      defaultChecked={initial?.kostenartIds.includes(k.id)}
                    />
                    {k.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Genau eine Kostenart wird beim Import fest vorgeschlagen. Bei mehreren oder keiner bleibt sie offen bzw.
                kommt aus dem bisherigen Verlauf (sofern sie zu den gewählten gehört).
              </p>
            </fieldset>
          </Abschnitt>

          <Abschnitt titel="Notiz">
            <textarea
              id="notiz"
              name="notiz"
              aria-label="Notiz"
              rows={3}
              defaultValue={initial?.notiz ?? ""}
              className={textareaClass}
            />
            {initial && (
              <div>
                <DateInput
                  name="verwaltungInformiertAm"
                  label="Über Verwalterwechsel informiert am"
                  defaultValue={iso(initial.verwaltungInformiertAm)}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Wann der Dienstleister über die neue Verwaltung benachrichtigt wurde; leer = noch offen. Lässt sich auch
                  in der Liste anklicken.
                </p>
              </div>
            )}
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
