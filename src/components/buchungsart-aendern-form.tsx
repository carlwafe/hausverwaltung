"use client";

import { useActionState, useState } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { aendereBuchungsart } from "@/app/(app)/buchungen/actions";
import { ermittleBuchungsartGruppe } from "@/lib/import/buchung-klassifizierung";

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const input =
  "w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400";

export function BuchungsartAendernForm({
  buchungId,
  arten,
  mietvertraege,
  kostenarten,
  aktuelleMietvertragId,
  rueckPfad,
  vorschlagMonat,
  vorschlagJahr,
}: {
  buchungId: string;
  arten: { code: string; bezeichnung: string }[];
  mietvertraege: { id: string; label: string }[];
  kostenarten: { id: string; name: string }[];
  aktuelleMietvertragId: string;
  rueckPfad: string;
  vorschlagMonat: number;
  vorschlagJahr: number;
}) {
  const [offen, setOffen] = useState(false);
  const [zielCode, setZielCode] = useState("");
  const [mietvertragId, setMietvertragId] = useState(aktuelleMietvertragId);
  const [fehler, formAction, pending] = useActionState(aendereBuchungsart.bind(null, buchungId, rueckPfad), null);
  const gruppe = zielCode ? ermittleBuchungsartGruppe(zielCode) : null;

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mt-4 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
      >
        Buchungsart ändern…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">Buchungsart ändern</p>
      <p className="mb-3 text-xs text-neutral-500">
        Bucht diese Buchung mit anderer Buchungsart um: das Original wird storniert und neu angelegt, die
        Bankzeile bleibt verknüpft (kein erneuter Import nötig). Beim Wechsel von/zu Kosten wird das Vorzeichen
        automatisch angepasst.
      </p>
      <form action={formAction} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Neue Buchungsart</label>
          <select
            name="zielCode"
            required
            value={zielCode}
            onChange={(e) => setZielCode(e.target.value)}
            className={input}
          >
            <option value="">– wählen –</option>
            {arten.map((a) => (
              <option key={a.code} value={a.code} className="bg-neutral-900">
                {a.bezeichnung}
              </option>
            ))}
          </select>
        </div>

        {gruppe && gruppe !== "KOSTEN" && gruppe !== "MIETWEITERLEITUNG" && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Mietvertrag{gruppe === "MIETE" || gruppe === "SONDERZAHLUNG" ? "" : " (optional)"}
            </label>
            <MietvertragAuswahl
              kandidaten={mietvertraege}
              value={mietvertragId}
              leerLabel="– keinem Mietvertrag zuordnen –"
              onChange={setMietvertragId}
            />
            <input type="hidden" name="mietvertragId" value={mietvertragId} />
          </div>
        )}

        {gruppe === "MIETE" && (
          <div className="flex gap-2">
            <div className="w-24">
              <label className="mb-1 block text-xs text-neutral-400">Monat</label>
              <select name="periodeMonat" defaultValue={vorschlagMonat} className={input}>
                {MONATE.map((m, i) => (
                  <option key={m} value={i + 1} className="bg-neutral-900">
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs text-neutral-400">Jahr</label>
              <input type="number" name="periodeJahr" defaultValue={vorschlagJahr} className={input} />
            </div>
          </div>
        )}

        {gruppe === "NEBENKOSTENAUSGLEICH" && (
          <div className="w-32">
            <label className="mb-1 block text-xs text-neutral-400">Abrechnungsjahr (optional)</label>
            <input type="number" name="jahr" className={input} />
          </div>
        )}

        {gruppe === "KOSTEN" && (
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Kostenart</label>
            <select name="kostenartId" required className={input}>
              <option value="">– wählen –</option>
              {kostenarten.map((k) => (
                <option key={k.id} value={k.id} className="bg-neutral-900">
                  {k.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">Gebäude-Zuordnung danach auf der Kosten-Seite ergänzbar.</p>
          </div>
        )}

        {fehler && <p className="text-sm text-red-400">{fehler}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !zielCode}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            {pending ? "Buche um…" : "Umbuchen"}
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
