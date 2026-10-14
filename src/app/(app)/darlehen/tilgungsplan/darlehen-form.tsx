"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { runFormAction } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { speichereDarlehen } from "./actions";

const feld = "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";
const label = "mb-1 block text-xs text-neutral-400";

export type DarlehenFormWerte = {
  id: string;
  bezeichnung: string;
  darlehensnummer: string;
  bank: string;
  darlehensbetrag: number;
  startRestschuld: number;
  startDatum: string;
  rate: number;
  zinssatz: number;
  zahltag: number;
  zinsbindungBis: string;
  laufzeitEnde: string;
  bemerkung: string;
  aktiv: boolean;
  stufen: { ab: string; zinssatz: number; rate?: number }[];
  bankwerte: { jahr: number; zinsen?: number; tilgung?: number; restschuld?: number }[];
};

const komma = (n: number | undefined) => (n === undefined ? "" : String(n).replace(".", ","));
const alsZahl = (t: string) => {
  const s = t.trim().replace(/\s/g, "");
  if (!s) return undefined;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
};

type StufeZeile = { ab: string; zinssatz: string; rate: string };
type BankZeile = { jahr: string; zinsen: string; tilgung: string; restschuld: string };

export function DarlehenForm({ werte }: { werte?: DarlehenFormWerte }) {
  const [fehler, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereDarlehen, formData),
    null,
  );
  const [stufen, setStufen] = useState<StufeZeile[]>(
    (werte?.stufen ?? []).map((s) => ({ ab: s.ab, zinssatz: komma(s.zinssatz), rate: komma(s.rate) })),
  );
  const [bank, setBank] = useState<BankZeile[]>(
    (werte?.bankwerte ?? []).map((b) => ({ jahr: String(b.jahr), zinsen: komma(b.zinsen), tilgung: komma(b.tilgung), restschuld: komma(b.restschuld) })),
  );

  const stufenJson = JSON.stringify(
    stufen.filter((s) => s.ab || s.zinssatz).map((s) => ({ ab: s.ab, zinssatz: alsZahl(s.zinssatz), rate: alsZahl(s.rate) })),
  );
  const bankJson = JSON.stringify(
    bank.filter((b) => b.jahr || b.zinsen || b.tilgung || b.restschuld).map((b) => ({
      jahr: alsZahl(b.jahr),
      zinsen: alsZahl(b.zinsen),
      tilgung: alsZahl(b.tilgung),
      restschuld: alsZahl(b.restschuld),
    })),
  );

  return (
    <form action={formAction} className="max-w-4xl space-y-6">
      {werte && <input type="hidden" name="id" value={werte.id} />}
      <input type="hidden" name="stufen" value={stufenJson} />
      <input type="hidden" name="bankwerte" value={bankJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="d-bezeichnung">Bezeichnung</label>
          <input id="d-bezeichnung" name="bezeichnung" required maxLength={100} defaultValue={werte?.bezeichnung} placeholder="z.B. Deutsche Bank …90" className={feld} />
        </div>
        <div>
          <label className={label} htmlFor="d-nummer">Darlehensnummer (optional)</label>
          <input id="d-nummer" name="darlehensnummer" maxLength={50} defaultValue={werte?.darlehensnummer} className={feld} />
        </div>
        <div>
          <label className={label} htmlFor="d-bank">Bank (optional)</label>
          <input id="d-bank" name="bank" maxLength={100} defaultValue={werte?.bank} className={feld} />
        </div>
        <div>
          <label className={label} htmlFor="d-betrag">Darlehensbetrag (€)</label>
          <input id="d-betrag" name="darlehensbetrag" required inputMode="decimal" defaultValue={komma(werte?.darlehensbetrag)} className={feld} />
        </div>
      </div>

      <fieldset className="rounded-lg border border-neutral-800 p-4">
        <legend className="px-2 text-sm text-neutral-300">Ausgangsstand und Konditionen</legend>
        <p className="mb-3 text-xs text-neutral-400">
          Ausgangspunkt der Nachrechnung ist die Restschuld nach der letzten bekannten Rate (z.B. „Kapitalstand“ im Plan
          der Bank oder der Saldo einer Saldenmitteilung). Die Rate ist die gesamte monatliche Abbuchung aus Zins und Tilgung.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <DateInput name="startDatum" label="Stichtag der Restschuld" labelClassName={label} defaultValue={werte?.startDatum} required />
          </div>
          <div>
            <label className={label} htmlFor="d-rest">Restschuld dann (€)</label>
            <input id="d-rest" name="startRestschuld" required inputMode="decimal" defaultValue={komma(werte?.startRestschuld)} className={feld} />
          </div>
          <div>
            <label className={label} htmlFor="d-rate">Monatliche Rate (€)</label>
            <input id="d-rate" name="rate" required inputMode="decimal" defaultValue={komma(werte?.rate)} className={feld} />
          </div>
          <div>
            <label className={label} htmlFor="d-satz">Sollzinssatz (% p.a.)</label>
            <input id="d-satz" name="zinssatz" required inputMode="decimal" defaultValue={komma(werte?.zinssatz)} placeholder="1,69" className={feld} />
          </div>
          <div>
            <label className={label} htmlFor="d-zahltag">Zahltag im Monat</label>
            <input id="d-zahltag" name="zahltag" type="number" min={1} max={28} defaultValue={werte?.zahltag ?? 15} className={feld} />
          </div>
          <div>
            <DateInput name="zinsbindungBis" label="Zinsbindung bis (optional)" labelClassName={label} defaultValue={werte?.zinsbindungBis} />
          </div>
          <div>
            <DateInput name="laufzeitEnde" label="Laufzeitende (optional)" labelClassName={label} defaultValue={werte?.laufzeitEnde} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-neutral-800 p-4">
        <legend className="px-2 text-sm text-neutral-300">Änderungen von Zinssatz oder Rate (optional)</legend>
        <p className="mb-3 text-xs text-neutral-400">
          Nach Ende der Zinsbindung gilt ein neuer Zinssatz: ab dem Datum rechnet der Plan mit dem neuen Satz (und, falls
          angegeben, der neuen Rate). Ohne Eintrag rechnet er mit dem Satz oben weiter.
        </p>
        {stufen.map((s, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
            <DateInput label={i === 0 ? "Gilt ab" : undefined} labelClassName={label} value={s.ab} onChange={(v) => setStufen((l) => l.map((x, j) => (j === i ? { ...x, ab: v } : x)))} />
            <div>
              {i === 0 && <label className={label}>Zinssatz (% p.a.)</label>}
              <input value={s.zinssatz} inputMode="decimal" onChange={(e) => setStufen((l) => l.map((x, j) => (j === i ? { ...x, zinssatz: e.target.value } : x)))} className={feld} />
            </div>
            <div>
              {i === 0 && <label className={label}>Neue Rate (€, optional)</label>}
              <input value={s.rate} inputMode="decimal" onChange={(e) => setStufen((l) => l.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} className={feld} />
            </div>
            <button type="button" onClick={() => setStufen((l) => l.filter((_, j) => j !== i))} className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setStufen((l) => [...l, { ab: "", zinssatz: "", rate: "" }])} className="text-sm text-neutral-300 underline hover:text-white">
          + Änderung hinzufügen
        </button>
      </fieldset>

      <fieldset className="rounded-lg border border-neutral-800 p-4">
        <legend className="px-2 text-sm text-neutral-300">Jahreswerte der Bank zur Kontrolle (optional)</legend>
        <p className="mb-3 text-xs text-neutral-400">
          Aus der Zins- und Kostenbescheinigung bzw. Saldenmitteilung zum Jahresende: Sollzinsen, Tilgung und Saldo (Restschuld
          am 31.12.). Der Plan zeigt dann je Jahr, ob er mit der Bank übereinstimmt.
        </p>
        {bank.map((b, i) => (
          <div key={i} className="mb-2 grid grid-cols-[6rem_1fr_1fr_1fr_auto] items-end gap-3">
            <div>
              {i === 0 && <label className={label}>Jahr</label>}
              <input value={b.jahr} inputMode="numeric" onChange={(e) => setBank((l) => l.map((x, j) => (j === i ? { ...x, jahr: e.target.value } : x)))} className={feld} />
            </div>
            <div>
              {i === 0 && <label className={label}>Sollzinsen (€)</label>}
              <input value={b.zinsen} inputMode="decimal" onChange={(e) => setBank((l) => l.map((x, j) => (j === i ? { ...x, zinsen: e.target.value } : x)))} className={feld} />
            </div>
            <div>
              {i === 0 && <label className={label}>Tilgung (€)</label>}
              <input value={b.tilgung} inputMode="decimal" onChange={(e) => setBank((l) => l.map((x, j) => (j === i ? { ...x, tilgung: e.target.value } : x)))} className={feld} />
            </div>
            <div>
              {i === 0 && <label className={label}>Restschuld 31.12. (€)</label>}
              <input value={b.restschuld} inputMode="decimal" onChange={(e) => setBank((l) => l.map((x, j) => (j === i ? { ...x, restschuld: e.target.value } : x)))} className={feld} />
            </div>
            <button type="button" onClick={() => setBank((l) => l.filter((_, j) => j !== i))} className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setBank((l) => [...l, { jahr: "", zinsen: "", tilgung: "", restschuld: "" }])} className="text-sm text-neutral-300 underline hover:text-white">
          + Jahr hinzufügen
        </button>
      </fieldset>

      <div>
        <label className={label} htmlFor="d-bemerkung">Bemerkung (optional)</label>
        <textarea id="d-bemerkung" name="bemerkung" rows={2} maxLength={500} defaultValue={werte?.bemerkung} className={feld} />
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input type="checkbox" name="aktiv" defaultChecked={werte?.aktiv ?? true} />
        Darlehen läuft noch (inaktive stehen grau am Ende und zählen nicht in die Summen)
      </label>

      {fehler && <p className="text-sm text-red-400">{fehler}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50">
          {pending ? "Speichern…" : "Speichern"}
        </button>
        <Link href={werte ? `/darlehen/tilgungsplan?darlehen=${werte.id}` : "/darlehen/tilgungsplan"} prefetch={false} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-white hover:bg-neutral-900">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
