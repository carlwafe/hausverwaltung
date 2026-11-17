"use client";

import { DateInput } from "@/components/date-input";
import { useActionState, useState } from "react";
import { runFormAction, type FormAktion } from "@/lib/form-utils";
import { gruppiereKostenarten } from "@/lib/kostenart-gruppen";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import type { VirtuelleAuszahlungOption } from "./virtuelle-auszahlungen";

type Kostenposition = {
  kostenartId: string;
  // Vorbelegter Wert für das Gebäude/Haus-<select>, siehe gebaeudeAuswahlWert.
  gebaeudeAuswahl: string;
  jahr: number;
  // yyyy-mm-dd, passend zum <input type="date">, oder null ohne bekanntes Datum.
  datum: string | null;
  betrag: string;
  beschreibung: string | null;
  empfaenger: string | null;
  virtuelleKautionBuchungId: string | null;
  // yyyy-mm-dd: ab wann die modernisierte Wohnung bezugsbereit war (nur Anschaffung / Herstellung).
  bezugsbereitAb: string | null;
};

export function KostenpositionForm({
  kostenarten,
  gebaeude,
  virtuelleAuszahlungen,
  initial,
  // Echte, per Kontoauszug importierte Kontobewegung — ihr Datum stammt aus der Bank und darf
  // hier nicht verändert werden (nur bei initial relevant, eine neue Position ist nie importiert).
  istImportiert = false,
  action,
}: {
  // anschaffung: Kostenart mit Einordnung „Anschaffung / Herstellung“ (AfA) — dann ist „bezugsbereit ab“ Pflicht.
  kostenarten: { id: string; label: string; anschaffung?: boolean }[];
  gebaeude: { label: string; optionen: { value: string; label: string }[] }[];
  /** Kautionsbuchungen der Kategorie VIRTUELLE_AUSZAHLUNG — mögliche Gegenbuchungen. */
  virtuelleAuszahlungen: VirtuelleAuszahlungOption[];
  initial?: Kostenposition;
  istImportiert?: boolean;
  action: FormAktion;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.label);
  const [kostenartId, setKostenartId] = useState(initial?.kostenartId ?? "");
  const verlangtBezugsbereit = kostenarten.find((k) => k.id === kostenartId)?.anschaffung === true;
  const [virtuelleKautionBuchungId, setVirtuelleKautionBuchungId] = useState(
    initial?.virtuelleKautionBuchungId ?? "",
  );
  // Vorauswahl auf Kautionsbuchungen vom heutigen Tag, solange noch nicht gesucht wurde — das
  // Kosten-Formular kennt (anders als die Kaution-Seite) kein eigenes Buchungsdatum, "heute" ist
  // hier die sinnvollste Näherung, da eine virtuelle Gutschrift meist zeitnah zur zugehörigen
  // Auszahlung erfasst wird. Fällt auf die volle Liste zurück, falls an diesem Tag nichts passt.
  const heuteISO = new Date().toISOString().slice(0, 10);
  const auszahlungenHeute = virtuelleAuszahlungen.filter((v) => v.datumISO === heuteISO);

  const feld =
    "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";
  const label = "mb-1 block text-sm font-medium";
  const abschnitt = "text-xs font-medium uppercase tracking-wide text-neutral-400";

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-neutral-800 p-5">
      <section className="space-y-4">
        <h2 className={abschnitt}>Zuordnung</h2>
        <div>
          <label className={label} htmlFor="kostenartId">
            Kostenart
          </label>
          <select
            id="kostenartId"
            name="kostenartId"
            required
            value={kostenartId}
            onChange={(e) => setKostenartId(e.target.value)}
            className={feld}
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {kostenartGruppen.map((gruppe) =>
              gruppe.label ? (
                <optgroup key={gruppe.label} label={gruppe.label}>
                  {gruppe.items.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                gruppe.items.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))
              ),
            )}
          </select>
        </div>

        {verlangtBezugsbereit && (
          <div className="rounded-lg border border-amber-900/50 bg-amber-500/5 p-3">
            <DateInput
              id="bezugsbereitAb"
              name="bezugsbereitAb"
              label="Bezugsbereit ab (Pflicht)"
              required
              defaultValue={initial?.bezugsbereitAb ?? ""}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Anschaffung / Herstellung wird über die Nutzungsdauer abgeschrieben (AfA). Der Beginn hängt davon ab,
              ab wann die Wohnung bezugsbereit bzw. die Anschaffung nutzbar war — z.B. das Datum der Übergabe oder
              der letzten Rechnung zur Modernisierung.
            </p>
          </div>
        )}

        <div>
          <label className={label} htmlFor="gebaeudeId">
            Gebäude
          </label>
          <select id="gebaeudeId" name="gebaeudeId" defaultValue={initial?.gebaeudeAuswahl ?? ""} className={feld}>
            <option value="">– Objekt gesamt (kein einzelnes Gebäude) –</option>
            {gebaeude.map((gruppe) => (
              <optgroup key={gruppe.label} label={gruppe.label}>
                {gruppe.optionen.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-3 border-t border-neutral-800 pt-5">
        <h2 className={abschnitt}>Betrag und Zeitraum</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
          <div className="col-span-2 sm:col-span-1">
            <label className={label} htmlFor="betrag">
              Betrag (€)
            </label>
            <input
              id="betrag"
              name="betrag"
              type="number"
              step="0.01"
              required
              defaultValue={initial?.betrag}
              className={`${feld} tabular-nums`}
            />
          </div>
          <div>
            <label className={label} htmlFor="jahr">
              Kostenjahr
            </label>
            <input
              id="jahr"
              name="jahr"
              type="number"
              required
              defaultValue={initial?.jahr ?? new Date().getFullYear()}
              className={feld}
            />
          </div>
          {istImportiert ? (
            <div>
              <span className={label}>Datum</span>
              <p className="flex h-10 items-center text-sm tabular-nums">
                {initial?.datum ? initial.datum.split("-").reverse().join(".") : "–"}
              </p>
            </div>
          ) : (
            <div>
              <DateInput id="datum" name="datum" label="Datum (optional)" defaultValue={initial?.datum ?? ""} />
            </div>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Ausgabe positiv, Gutschrift negativ. Das Kostenjahr gilt nur für die Betriebskostenabrechnung, die
          Jahresübersicht zählt nach Datum (Abbuchung).
          {istImportiert && " Das Datum stammt aus dem Kontoauszug."}
        </p>
      </section>

      <section className="space-y-4 border-t border-neutral-800 pt-5">
        <h2 className={abschnitt}>Details</h2>
        <div>
          <label className={label} htmlFor="empfaenger">
            Empfänger (optional)
          </label>
          <input
            id="empfaenger"
            name="empfaenger"
            defaultValue={initial?.empfaenger ?? ""}
            placeholder="z.B. Handwerksfirma, Versorger"
            className={feld}
          />
        </div>

        <div>
          <label className={label} htmlFor="beschreibung">
            Beschreibung (optional)
          </label>
          <textarea
            id="beschreibung"
            name="beschreibung"
            rows={3}
            defaultValue={initial?.beschreibung ?? ""}
            className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        <details className="rounded-md border border-neutral-800 px-3 py-2" open={virtuelleKautionBuchungId !== ""}>
          <summary className="cursor-pointer text-sm font-medium">Verknüpfte Kautionsverrechnung (optional)</summary>
          <input type="hidden" name="virtuelleKautionBuchungId" value={virtuelleKautionBuchungId} />
          <p className="mb-2 mt-2 text-xs text-neutral-500">
            Für eine Gutschrift, die keine eigene Kontobewegung ist — z.B. eine Reparatur, die vom
            einbehaltenen Kautionsrest bezahlt wurde, statt über alle Mieter umgelegt zu werden.
            Zeigt zunächst nur Verrechnungen vom heutigen Tag — zum Suchen einfach tippen.
          </p>
          <div className="pb-1">
            <MietvertragAuswahl
              kandidaten={virtuelleAuszahlungen}
              defaultKandidaten={auszahlungenHeute.length > 0 ? auszahlungenHeute : undefined}
              value={virtuelleKautionBuchungId}
              onChange={setVirtuelleKautionBuchungId}
              leerLabel="– keine –"
              size="md"
            />
          </div>
        </details>
      </section>

      <div className="flex items-center gap-4 border-t border-neutral-800 pt-5">
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
