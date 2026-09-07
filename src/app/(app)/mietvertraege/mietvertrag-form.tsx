"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";

type Option = { id: string; label: string };
type EinheitOption = Option & { typ: "WOHNUNG" | "GARAGE" };

type Initial = {
  einheitId: string;
  mieterId1: string;
  mieterId2?: string;
  beginn: string;
  beginnUnbekannt?: boolean;
  ende: string;
  kaltmiete: string;
  nebenkostenVorauszahlung: string;
  mehrwertsteuer?: string;
  status: string;
  kautionBetrag?: string;
  kautionAnlageform?: string;
  kautionZinssatz?: string;
};

export function MietvertragForm({
  einheiten,
  mieter,
  initial,
  action,
}: {
  einheiten: EinheitOption[];
  mieter: Option[];
  initial?: Initial;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [einheitId, setEinheitId] = useState(initial?.einheitId ?? "");
  const istGarage = einheiten.find((e) => e.id === einheitId)?.typ === "GARAGE";
  const [mieterId1, setMieterId1] = useState(initial?.mieterId1 ?? "");
  const [mieterId2, setMieterId2] = useState(initial?.mieterId2 ?? "");
  const [beginnUnbekannt, setBeginnUnbekannt] = useState(initial?.beginnUnbekannt ?? false);
  // Als React State statt unkontrolliert per defaultValue geführt: React 19 setzt ein <form
  // action={...}> nach jeder Aktion (auch nach einem fehlgeschlagenen Speichern-Versuch mit
  // Fehlermeldung) automatisch auf seine Ursprungswerte zurück — bei unkontrollierten Feldern
  // wären damit nach einem Fehler alle bereits eingetragenen Werte weg. Kontrollierte Felder
  // "heilen" sich beim nächsten Render (ausgelöst durch die Fehlermeldung) selbst wieder, da ihr
  // Wert aus dem (unverändert gebliebenen) State neu gesetzt wird.
  const [kaltmiete, setKaltmiete] = useState(initial?.kaltmiete ?? "");
  const [nebenkostenVorauszahlung, setNebenkostenVorauszahlung] = useState(
    initial?.nebenkostenVorauszahlung ?? "",
  );
  const [mehrwertsteuer, setMehrwertsteuer] = useState(initial?.mehrwertsteuer ?? "");
  const [status, setStatus] = useState(initial?.status ?? "AKTIV");
  const [kautionBetrag, setKautionBetrag] = useState(initial?.kautionBetrag ?? "");
  const [kautionAnlageform, setKautionAnlageform] = useState(initial?.kautionAnlageform ?? "KAUTIONSKONTO");
  const [kautionZinssatz, setKautionZinssatz] = useState(initial?.kautionZinssatz ?? "");

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="einheitId">
          Einheit
        </label>
        <select
          id="einheitId"
          name="einheitId"
          required
          value={einheitId}
          onChange={(e) => setEinheitId(e.target.value)}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="" disabled>
            Bitte wählen…
          </option>
          {einheiten.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mieterId1">
            Mieter
          </label>
          <input type="hidden" id="mieterId1" name="mieterId1" value={mieterId1} required />
          <MietvertragAuswahl
            kandidaten={mieter}
            value={mieterId1}
            onChange={setMieterId1}
            leerLabel="Bitte wählen…"
            size="md"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mieterId2">
            2. Mieter (optional)
          </label>
          <input type="hidden" id="mieterId2" name="mieterId2" value={mieterId2} />
          <MietvertragAuswahl
            kandidaten={mieter}
            value={mieterId2}
            onChange={setMieterId2}
            leerLabel="– keiner –"
            size="md"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 flex min-h-10 items-end justify-between gap-2">
            <span className="text-sm font-medium">Mietbeginn</span>
            <label className="flex items-center gap-1 text-xs font-normal text-neutral-400">
              <input
                type="checkbox"
                checked={beginnUnbekannt}
                onChange={(e) => setBeginnUnbekannt(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-700 bg-transparent"
              />
              unbekannt
            </label>
          </div>
          {beginnUnbekannt ? (
            <div className="flex h-[38px] items-center rounded-md border border-neutral-800 px-3 text-sm text-neutral-500">
              unbekannt
            </div>
          ) : (
            <DateInput id="beginn" name="beginn" defaultValue={initial?.beginn} />
          )}
          <input type="hidden" name="beginnUnbekannt" value={beginnUnbekannt ? "on" : ""} />
        </div>
        <DateInput
          id="ende"
          name="ende"
          label="Mietende (erforderlich bei Status „Beendet“)"
          defaultValue={initial?.ende}
          labelClassName="min-h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 flex min-h-10 items-end text-sm font-medium" htmlFor="kaltmiete">
            Kaltmiete (€)
          </label>
          <input
            id="kaltmiete"
            name="kaltmiete"
            type="number"
            step="0.01"
            required
            value={kaltmiete}
            onChange={(e) => setKaltmiete(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label
            className="mb-1 flex min-h-10 items-end text-sm font-medium"
            htmlFor="nebenkostenVorauszahlung"
          >
            NK-Vorauszahlung (€){istGarage && " (optional bei Garagen)"}
          </label>
          <input
            id="nebenkostenVorauszahlung"
            name="nebenkostenVorauszahlung"
            type="number"
            step="0.01"
            required={!istGarage}
            value={nebenkostenVorauszahlung}
            onChange={(e) => setNebenkostenVorauszahlung(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {istGarage && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mehrwertsteuer">
            Mehrwertsteuer (€)
          </label>
          <input
            id="mehrwertsteuer"
            name="mehrwertsteuer"
            type="number"
            step="0.01"
            required
            value={mehrwertsteuer}
            onChange={(e) => setMehrwertsteuer(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="AKTIV">Aktiv</option>
          <option value="GEPLANT">Geplant</option>
          <option value="BEENDET">Beendet</option>
        </select>
      </div>

      <fieldset className="rounded-md border border-neutral-800 p-4">
        <legend className="px-1 text-sm font-medium">Kaution (optional)</legend>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionBetrag">
              Betrag (€)
            </label>
            <input
              id="kautionBetrag"
              name="kautionBetrag"
              type="number"
              step="0.01"
              value={kautionBetrag}
              onChange={(e) => setKautionBetrag(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionAnlageform">
              Anlageform
            </label>
            <select
              id="kautionAnlageform"
              name="kautionAnlageform"
              value={kautionAnlageform}
              onChange={(e) => setKautionAnlageform(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            >
              <option value="KAUTIONSKONTO">Kautionskonto</option>
              <option value="SPARBUCH">Sparbuch</option>
              <option value="BUERGSCHAFT">Bürgschaft</option>
              <option value="BAR">Bar</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionZinssatz">
              Zinssatz (%)
            </label>
            <input
              id="kautionZinssatz"
              name="kautionZinssatz"
              type="number"
              step="0.01"
              value={kautionZinssatz}
              onChange={(e) => setKautionZinssatz(e.target.value)}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
