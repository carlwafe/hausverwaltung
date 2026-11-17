"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { runFormAction, type FormAktion } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { TICKET_KATEGORIE, TICKET_PRIORITAET, TICKET_STATUS } from "@/lib/ticket";

type Option = { id: string; label: string };

export type TicketFormWerte = {
  privat: boolean;
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
const selectClass = `${inputClass} h-10`;
const labelClass = "mb-1 block text-sm font-medium";

const GESPEICHERT = "__gespeichert";

// Textfeld, das mit dem Inhalt wächst — lange Titel/Beschreibungen (v.a. am Handy) werden sonst abgeschnitten bzw. müssen gescrollt werden.
// `einzeilig`: Titel ohne Zeilenumbruch (Enter sendet das Formular wie bei einem normalen Eingabefeld).
function WachsendesTextfeld({
  einzeilig,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  einzeilig?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function anpassen() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight enthält den Rahmen nicht — bei border-box fehlen sonst 2 px und das Feld ist niedriger als die übrigen (h-10).
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }
  useLayoutEffect(anpassen, []);
  return (
    <textarea
      ref={ref}
      {...props}
      onInput={(e) => {
        if (einzeilig && e.currentTarget.value.includes("\n")) {
          e.currentTarget.value = e.currentTarget.value.replace(/\s*\n+\s*/g, " ");
        }
        anpassen();
      }}
      onKeyDown={
        einzeilig
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }
          : undefined
      }
      className={`${props.className ?? ""} resize-none overflow-hidden`}
    />
  );
}

export function TicketForm({
  initial,
  optionen,
  action,
  bearbeiten = false,
  kannPrivatAendern = true,
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
  /** Nur der Ersteller (bzw. jeder bei Altbestand ohne Ersteller) darf „Privat“ umstellen. */
  kannPrivatAendern?: boolean;
}) {
  const [privat, setPrivat] = useState(initial.privat);
  const [einheitId, setEinheitId] = useState(initial.einheitId);
  const [mietvertragId, setMietvertragId] = useState(initial.mietvertragId);
  const [status, setStatus] = useState(initial.status);
  // Neues Ticket: kein Seitenraster, Felder paarweise nebeneinander (breite Einzelfelder wirken auf leerer Fläche verloren).
  const spalten = bearbeiten ? "" : "sm:grid-cols-2";
  const weitererBezugGesetzt = !!(initial.hausId || initial.gebaeudeId || initial.dienstleisterId);

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
    <form action={formAction} className="contents">
      {/* Hauptteil (am PC links oben): Titel und Beschreibung */}
      <div className="space-y-4 xl:col-start-1 xl:row-start-1">
        <div>
          <label className={bearbeiten ? "sr-only" : labelClass} htmlFor="titel">
            Titel
          </label>
          <WachsendesTextfeld
            einzeilig
            rows={1}
            id="titel"
            name="titel"
            required
            defaultValue={initial.titel}
            placeholder="z.B. Wasserhahn tropft im Bad"
            className={`${inputClass} min-h-10 ${bearbeiten ? "text-lg font-semibold" : ""}`}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="beschreibung">
            Beschreibung (optional)
          </label>
          <WachsendesTextfeld
            id="beschreibung"
            name="beschreibung"
            rows={bearbeiten ? 5 : 4}
            defaultValue={initial.beschreibung}
            className={inputClass}
          />
        </div>
      </div>

      {/* Seitenleiste (am PC rechts, bleibt beim Scrollen stehen): Eigenschaften, Bezug, Speichern */}
      <aside
        className={`space-y-4 rounded-lg border border-neutral-800 p-4 ${bearbeiten ? "xl:sticky xl:top-4 xl:col-start-2 xl:row-span-4 xl:row-start-1 xl:self-start" : ""}`}
      >
        <div className={`grid gap-3 ${bearbeiten ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
          <div>
            <label className={labelClass} htmlFor="status">
              Status
            </label>
            <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
              {TICKET_STATUS.map((s) => (
                <option key={s.value} value={s.value} className="bg-neutral-900">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="prioritaet">
              Priorität
            </label>
            <select id="prioritaet" name="prioritaet" defaultValue={initial.prioritaet} className={selectClass}>
              {TICKET_PRIORITAET.map((p) => (
                <option key={p.value} value={p.value} className="bg-neutral-900">
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className={bearbeiten ? "col-span-2" : "col-span-2 sm:col-span-1"}>
            <label className={labelClass} htmlFor="kategorie">
              Kategorie
            </label>
            <select id="kategorie" name="kategorie" defaultValue={initial.kategorie} className={selectClass}>
              {TICKET_KATEGORIE.map((k) => (
                <option key={k.value} value={k.value} className="bg-neutral-900">
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={`grid gap-4 border-t border-neutral-800 pt-4 ${spalten}`}>
          <div>
            <label className={labelClass}>Fällig am (optional)</label>
            <DateInput name="faelligAm" defaultValue={initial.faelligAm} />
          </div>
          <div>
            <label className={labelClass} htmlFor="zugewiesenAnId">
              Zuständig (optional)
            </label>
            <select
              id="zugewiesenAnId"
              name="zugewiesenAnId"
              defaultValue={initial.zugewiesenAnId}
              disabled={privat}
              className={`${selectClass} disabled:opacity-50`}
            >
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

        <div className="space-y-4 border-t border-neutral-800 pt-4">
          <p className="text-sm font-medium">Bezug (optional)</p>
          <div className={`grid gap-4 ${spalten}`}>
            <div>
              <label className={`${labelClass} text-neutral-400`}>Einheit</label>
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
              <label className={`${labelClass} text-neutral-400`}>Mietvertrag</label>
              <input type="hidden" name="mietvertragId" value={mietvertragId} />
              <MietvertragAuswahl
                kandidaten={optionen.mietvertraege}
                defaultKandidaten={mietvertraegeZurEinheit}
                value={mietvertragId}
                onChange={waehleMietvertrag}
                leerLabel="– kein Mietvertrag –"
                size="md"
              />
            </div>
          </div>
          {/* Selten gebraucht (Dach, Treppenhaus, Handwerker): eingeklappt, solange nichts gewählt ist. */}
          <details open={weitererBezugGesetzt}>
            <summary className="cursor-pointer text-sm text-neutral-400 hover:text-white">
              Weiterer Bezug (Gebäude, Hausnummer, Dienstleister)
            </summary>
            <div className={`mt-3 grid gap-4 ${spalten}`}>
              <div>
                <label className={`${labelClass} text-neutral-400`} htmlFor="hausId">
                  Gebäude (z.B. Dach, Fassade)
                </label>
                <select id="hausId" name="hausId" defaultValue={initial.hausId} className={selectClass}>
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
                <label className={`${labelClass} text-neutral-400`} htmlFor="gebaeudeId">
                  Hausnummer (z.B. Treppenhaus, Eingang)
                </label>
                <select id="gebaeudeId" name="gebaeudeId" defaultValue={initial.gebaeudeId} className={selectClass}>
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
                <label className={`${labelClass} text-neutral-400`} htmlFor="dienstleisterId">
                  Dienstleister
                </label>
                <select
                  id="dienstleisterId"
                  name="dienstleisterId"
                  defaultValue={initial.dienstleisterId}
                  className={selectClass}
                >
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
          </details>
        </div>

        <div className="space-y-3 border-t border-neutral-800 pt-4">
          {kannPrivatAendern && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="privat"
                checked={privat}
                onChange={(e) => setPrivat(e.target.checked)}
                className="h-5 w-5 shrink-0"
              />
              <span>
                <span className="font-medium">Privat</span>
                <span className="text-neutral-400"> (nur du siehst es)</span>
              </span>
            </label>
          )}
          {meldung && meldung !== GESPEICHERT && <p className="text-sm text-red-400">{meldung}</p>}
          {meldung === GESPEICHERT && <p className="text-sm text-green-400">Gespeichert.</p>}
          <button
            type="submit"
            disabled={pending}
            className="h-10 w-full rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? "Speichern…" : bearbeiten ? "Speichern" : "Ticket anlegen"}
          </button>
        </div>
      </aside>
    </form>
  );
}
