"use client";

import { useActionState, useState } from "react";
import { runFormAction, type FormAktion } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { TICKET_KATEGORIE, TICKET_PRIORITAET, TICKET_STATUS } from "@/lib/ticket";

type Option = { id: string; label: string };

export type TicketFormWerte = {
  titel: string;
  beschreibung: string;
  status: string;
  prioritaet: string;
  kategorie: string;
  faelligAm: string;
  einheitId: string;
  mietvertragId: string;
  gebaeudeId: string;
  hausId: string;
  dienstleisterId: string;
  zugewiesenAnId: string;
};

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";
const labelClass = "mb-1 block text-sm font-medium";

const GESPEICHERT = "__gespeichert";

export function TicketForm({
  initial,
  optionen,
  action,
  bearbeiten = false,
}: {
  initial: TicketFormWerte;
  optionen: {
    einheiten: Option[];
    mietvertraege: (Option & { einheitId: string })[];
    gebaeude: Option[];
    haeuser: Option[];
    dienstleister: Option[];
    benutzer: Option[];
  };
  action: FormAktion;
  bearbeiten?: boolean;
}) {
  const [einheitId, setEinheitId] = useState(initial.einheitId);
  const [mietvertragId, setMietvertragId] = useState(initial.mietvertragId);
  const [status, setStatus] = useState(initial.status);

  const [meldung, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const fehler = await runFormAction(action, formData);
    return fehler ?? (bearbeiten ? GESPEICHERT : null);
  }, null);

  // Ein Mietvertrag legt die Einheit fest; wechselt die Einheit, passt der Vertrag nicht mehr.
  function waehleMietvertrag(id: string) {
    setMietvertragId(id);
    const vertrag = optionen.mietvertraege.find((v) => v.id === id);
    if (vertrag) setEinheitId(vertrag.einheitId);
  }
  function waehleEinheit(id: string) {
    setEinheitId(id);
    const vertrag = optionen.mietvertraege.find((v) => v.id === mietvertragId);
    if (vertrag && vertrag.einheitId !== id) setMietvertragId("");
  }

  const mietvertraegeZurEinheit = einheitId
    ? optionen.mietvertraege.filter((v) => v.einheitId === einheitId)
    : optionen.mietvertraege;

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <div>
        <label className={labelClass} htmlFor="titel">
          Titel
        </label>
        <input
          id="titel"
          name="titel"
          required
          defaultValue={initial.titel}
          placeholder="z.B. Wasserhahn tropft im Bad"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="beschreibung">
          Beschreibung (optional)
        </label>
        <textarea id="beschreibung" name="beschreibung" rows={4} defaultValue={initial.beschreibung} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="kategorie">
            Kategorie
          </label>
          <select id="kategorie" name="kategorie" defaultValue={initial.kategorie} className={inputClass}>
            {TICKET_KATEGORIE.map((k) => (
              <option key={k.value} value={k.value} className="bg-neutral-900">
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="prioritaet">
            Priorität
          </label>
          <select id="prioritaet" name="prioritaet" defaultValue={initial.prioritaet} className={inputClass}>
            {TICKET_PRIORITAET.map((p) => (
              <option key={p.value} value={p.value} className="bg-neutral-900">
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={inputClass}
          >
            {TICKET_STATUS.map((s) => (
              <option key={s.value} value={s.value} className="bg-neutral-900">
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Fällig am (optional)</label>
          <DateInput name="faelligAm" defaultValue={initial.faelligAm} />
        </div>
        <div>
          <label className={labelClass} htmlFor="zugewiesenAnId">
            Zuständig (optional)
          </label>
          <select id="zugewiesenAnId" name="zugewiesenAnId" defaultValue={initial.zugewiesenAnId} className={inputClass}>
            <option value="" className="bg-neutral-900">
              –
            </option>
            {optionen.benutzer.map((b) => (
              <option key={b.id} value={b.id} className="bg-neutral-900">
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-4 rounded-lg border border-neutral-800 p-4">
        <legend className="px-1 text-sm font-medium">Bezug (optional)</legend>
        <div>
          <label className={labelClass}>Einheit</label>
          <input type="hidden" name="einheitId" value={einheitId} />
          <MietvertragAuswahl
            kandidaten={optionen.einheiten}
            value={einheitId}
            onChange={waehleEinheit}
            leerLabel="– keine Einheit –"
            size="md"
          />
        </div>
        <div>
          <label className={labelClass}>Mietvertrag</label>
          <input type="hidden" name="mietvertragId" value={mietvertragId} />
          <MietvertragAuswahl
            kandidaten={mietvertraegeZurEinheit}
            value={mietvertragId}
            onChange={waehleMietvertrag}
            leerLabel="– kein Mietvertrag –"
            size="md"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="hausId">
              Gebäude (z.B. Dach, Fassade)
            </label>
            <select id="hausId" name="hausId" defaultValue={initial.hausId} className={inputClass}>
              <option value="" className="bg-neutral-900">
                –
              </option>
              {optionen.haeuser.map((h) => (
                <option key={h.id} value={h.id} className="bg-neutral-900">
                  {h.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="gebaeudeId">
              Hausnummer (z.B. Treppenhaus, Eingang)
            </label>
            <select id="gebaeudeId" name="gebaeudeId" defaultValue={initial.gebaeudeId} className={inputClass}>
              <option value="" className="bg-neutral-900">
                –
              </option>
              {optionen.gebaeude.map((g) => (
                <option key={g.id} value={g.id} className="bg-neutral-900">
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="dienstleisterId">
              Dienstleister
            </label>
            <select id="dienstleisterId" name="dienstleisterId" defaultValue={initial.dienstleisterId} className={inputClass}>
              <option value="" className="bg-neutral-900">
                –
              </option>
              {optionen.dienstleister.map((d) => (
                <option key={d.id} value={d.id} className="bg-neutral-900">
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {meldung && meldung !== GESPEICHERT && <p className="text-sm text-red-400">{meldung}</p>}
      {meldung === GESPEICHERT && <p className="text-sm text-green-400">Gespeichert.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : bearbeiten ? "Speichern" : "Ticket anlegen"}
      </button>
    </form>
  );
}
