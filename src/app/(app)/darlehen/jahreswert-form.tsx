"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { MONATE_KURZ, summiereMonate } from "@/lib/darlehen-zinsen";
import { speichereSchuldzinsenJahreswert } from "./actions";

const feld = "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

export type JahreswertDarlehen = {
  id: string;
  label: string;
  /** Zinsen je Monat laut Tilgungsplan (Index 0 = Januar), null = keine Rate im Plan. */
  monate: (number | null)[];
  /** Zinsen des Jahres laut Zinsbescheinigung (Stammdaten „Bankwerte“), sofern erfasst. */
  bankZinsen: number | null;
  /** Zinsen des Jahres aus den diesem Darlehen zugeordneten Raten über das Mietkonto. */
  mietkontoZinsen: number;
  /** Alle Raten des Jahres über das Mietkonto sind einem Darlehen zugeordnet (sonst fehlt Zins in der Rechnung). */
  alleRatenZugeordnet: boolean;
  /** Schon vorhandener Eintrag für dieses Jahr (wird beim Speichern ersetzt). */
  vorhanden: { betrag: number; vonMonat: number | null; bisMonat: number | null } | null;
};

// Zinsen „anderer Konten“ laut Bankbescheinigung: Jahreszinsen der Bank minus die Zinsen der über das Mietkonto gezahlten
// Raten dieses Darlehens (nur wenn alle Raten des Jahres einem Darlehen zugeordnet sind).
function bankRest(d: JahreswertDarlehen | null): number | null {
  if (!d || d.bankZinsen === null || !d.alleRatenZugeordnet) return null;
  return Math.round((d.bankZinsen - d.mietkontoZinsen) * 100) / 100;
}

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const eingabeText = (n: number) => n.toFixed(2).replace(".", ",");

export function JahreswertForm({ jahr, darlehen, standardBis }: { jahr: number; darlehen: JahreswertDarlehen[]; standardBis: number }) {
  const [darlehenId, setDarlehenId] = useState("");
  const [von, setVon] = useState(1);
  const [bis, setBis] = useState(standardBis);
  const [betrag, setBetrag] = useState("");
  const [betragGeaendert, setBetragGeaendert] = useState(false);

  const [fehler, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const meldung = await runFormAction(speichereSchuldzinsenJahreswert, formData);
      if (!meldung) {
        setDarlehenId("");
        setBetrag("");
        setBetragGeaendert(false);
      }
      return meldung;
    },
    null,
  );
  const gewaehlt = darlehen.find((d) => d.id === darlehenId) ?? null;
  const plan = gewaehlt && von <= bis ? summiereMonate(gewaehlt.monate, von, bis) : null;
  const rest = bankRest(gewaehlt);

  // Der Betrag folgt dem Tilgungsplan, solange er nicht von Hand geändert wurde.
  // Vorrang hat die Bankbescheinigung (Jahreszinsen − Mietkonto), sonst die Summe des Tilgungsplans für den Zeitraum.
  function vorschlagUebernehmen(d: JahreswertDarlehen | null, v: number, b: number) {
    if (!d) return;
    const rest = bankRest(d);
    if (rest !== null) {
      setBetrag(rest > 0 ? eingabeText(rest) : "");
      return;
    }
    if (v > b) return;
    const s = summiereMonate(d.monate, v, b);
    setBetrag(s.anzahl > 0 ? eingabeText(s.summe) : "");
  }
  function waehleDarlehen(id: string) {
    setDarlehenId(id);
    const d = darlehen.find((x) => x.id === id) ?? null;
    // Ein vorhandener Eintrag wird mit seinen Werten geöffnet, sonst gilt der Vorschlag aus dem Plan.
    if (d?.vorhanden) {
      setVon(d.vorhanden.vonMonat ?? 1);
      setBis(d.vorhanden.bisMonat ?? standardBis);
      setBetrag(eingabeText(d.vorhanden.betrag));
      setBetragGeaendert(true);
    } else {
      setVon(1);
      setBis(standardBis);
      setBetragGeaendert(false);
      vorschlagUebernehmen(d, 1, standardBis);
    }
  }
  function aendereZeitraum(v: number, b: number) {
    setVon(v);
    setBis(b);
    if (!betragGeaendert) vorschlagUebernehmen(gewaehlt, v, b);
  }

  if (darlehen.length === 0) {
    return (
      <p className="mt-3 text-sm text-amber-400">
        Es gibt noch kein aktives Darlehen. Lege es zuerst in den Stammdaten an (Darlehen &amp; Tilgungspläne).
      </p>
    );
  }

  const monatsOptionen = MONATE_KURZ.map((m, i) => (
    <option key={m} value={i + 1}>
      {m}
    </option>
  ));

  return (
    <form action={formAction} className="mt-3 max-w-4xl space-y-3">
      <input type="hidden" name="jahr" value={jahr} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_9rem]">
        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-darlehen">Darlehen</label>
          <select id="jw-darlehen" name="darlehenId" required value={darlehenId} onChange={(e) => waehleDarlehen(e.target.value)} className={feld}>
            <option value="">– Darlehen wählen –</option>
            {darlehen.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
                {d.vorhanden ? " (Eintrag vorhanden)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-von">Raten von</label>
          <select id="jw-von" name="vonMonat" value={von} onChange={(e) => aendereZeitraum(Number(e.target.value), bis)} className={feld}>
            {monatsOptionen}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-bis">bis</label>
          <select id="jw-bis" name="bisMonat" value={bis} onChange={(e) => aendereZeitraum(von, Number(e.target.value))} className={feld}>
            {monatsOptionen}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-betrag">Zinsen {jahr} (€)</label>
          <input
            id="jw-betrag"
            name="betrag"
            required
            inputMode="decimal"
            placeholder="0,00"
            value={betrag}
            onChange={(e) => {
              setBetrag(e.target.value);
              setBetragGeaendert(true);
            }}
            className={feld}
          />
        </div>
      </div>

      {gewaehlt && (
        <div className="space-y-1 text-xs text-neutral-400">
          {rest !== null && gewaehlt && gewaehlt.bankZinsen !== null && (
            <p>
              Laut Bankbescheinigung {euro(gewaehlt.bankZinsen)} − über das Mietkonto gezahlt {euro(gewaehlt.mietkontoZinsen)} ={" "}
              <span className={rest >= 0 ? "text-neutral-200" : "text-amber-400"}>{euro(rest)}</span> von anderen Konten.
              {rest < 0 && " Über das Mietkonto sind mehr Zinsen gebucht als die Bank bescheinigt — Raten und Zinsanteile prüfen."}
            </p>
          )}
          {gewaehlt && gewaehlt.bankZinsen !== null && !gewaehlt.alleRatenZugeordnet && (
            <p className="text-amber-400">
              Es gibt Raten über das Mietkonto ohne Darlehen — erst in der Liste oben zuordnen, dann rechnet die Seite „Bescheinigung − Mietkonto“.
            </p>
          )}
          {von > bis ? (
            <p className="text-amber-400">„Raten von“ liegt nach „bis“.</p>
          ) : plan && plan.anzahl > 0 ? (
            <p>
              Laut Tilgungsplan: {plan.anzahl} {plan.anzahl === 1 ? "Rate" : "Raten"} {MONATE_KURZ[von - 1]}–{MONATE_KURZ[bis - 1]} {jahr} mit zusammen{" "}
              <span className="text-neutral-200">{euro(plan.summe)}</span> Zinsen.
              {betragGeaendert && betrag.trim() !== eingabeText(plan.summe) && (
                <button type="button" onClick={() => { vorschlagUebernehmen(gewaehlt, von, bis); setBetragGeaendert(false); }} className="ml-2 underline hover:text-white">
                  Plan-Wert übernehmen
                </button>
              )}
            </p>
          ) : (
            <p className="text-amber-400">Für diesen Zeitraum liegt kein Tilgungsplan vor — Betrag von Hand eintragen.</p>
          )}
          {plan && plan.anzahl > 0 && plan.ohnePlan.length > 0 && (
            <p className="text-amber-400">
              Ohne Rate im Plan: {plan.ohnePlan.map((m) => MONATE_KURZ[m - 1]).join(", ")} — fehlen in der Summe.
            </p>
          )}
          {gewaehlt.bankZinsen !== null && rest === null && (
            <p>
              Zinsen {jahr} laut Bankbescheinigung (Stammdaten): <span className="text-neutral-200">{euro(gewaehlt.bankZinsen)}</span> für das ganze Jahr, also
              Mietkonto + andere Konten.
            </p>
          )}
          {gewaehlt.vorhanden && <p className="text-amber-400">Für dieses Darlehen gibt es schon einen Eintrag ({euro(gewaehlt.vorhanden.betrag)}) — er wird ersetzt.</p>}
          <p>
            Nimm nur Raten, die <span className="text-neutral-200">nicht über das Mietkonto</span> gezahlt wurden. Über das Mietkonto nachgezahlte
            Rückstände zählen dort mit — den Zeitraum entsprechend kürzen.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-bemerkung">Bemerkung (optional)</label>
          <input id="jw-bemerkung" name="bemerkung" maxLength={200} placeholder="z.B. Raten von Privatkonto" className={feld} />
        </div>
        <button
          type="submit"
          disabled={pending || !darlehenId}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : gewaehlt?.vorhanden ? "Ersetzen" : "Speichern"}
        </button>
      </div>
      {fehler && <p className="text-sm text-red-400">{fehler}</p>}
    </form>
  );
}
