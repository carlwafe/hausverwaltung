import Link from "next/link";
import { ladeKontoprognose, ladeKostenVorschlag, type PrognoseParameter } from "@/lib/kontoprognose-laden";
import { ANPASSBARE_KOSTENARTEN, VERWALTUNG_UEBERNOMMEN, indexZuMonat, leseZahl } from "@/lib/kontoprognose";
import { KontoprognoseChart } from "./kontoprognose-chart";

const euro0 = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const euro2 = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
const prozent = (v: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(v * 100)} %`;
const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(d);
const monatLang = (jahr: number, monat: number) =>
  new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(jahr, monat - 1, 1)));
const monatKurz = (jahr: number, monat: number) =>
  new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(jahr, monat - 1, 1)));

const feld = "h-9 rounded-md border border-neutral-700 bg-transparent px-2 text-sm text-white outline-none focus:border-neutral-400";
const betragFarbe = (v: number) => (v < 0 ? "text-red-400" : v > 0 ? "text-green-400" : "text-neutral-500");

type Suche = { monate?: string; weiterleitung?: string; nk?: string; verwaltung?: string; reparaturen?: string; sonstige?: string; vorschlag?: string };

// Schreibt den simulierten Kontostand monatsweise fort (Annahmen und Rechnung: src/lib/kontoprognose.ts).
// Wie die Jahresübersicht rechnet die Seite erst nach „Berechnen“ (Vercel-CPU, docs/deployment-vercel.md).
export default async function KontoprognosePage({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  const angefordert = sp.monate !== undefined;

  const monate = [6, 12, 18, 24].includes(Number(sp.monate)) ? Number(sp.monate) : 12;
  const weiterleitung = leseZahl(sp.weiterleitung);
  const parameter: PrognoseParameter = {
    monate,
    weiterleitung: weiterleitung === null ? null : Math.max(0, weiterleitung),
    nkAusgleich: sp.nk === "keiner" ? "keiner" : "vorjahr",
    kostenAnteile: {},
  };
  // Vorschlag aus den Monaten seit der Übernahme der Verwaltung: füllt nur Felder, die in der Adresse fehlen
  // (ein abgeschicktes Formular sendet sie auch leer mit und überschreibt den Vorschlag so nicht).
  const mitVorschlag = sp.vorschlag === "1";
  const vorschlag = mitVorschlag ? await ladeKostenVorschlag() : null;
  const feldWert: Record<string, string> = {};
  for (const k of ANPASSBARE_KOSTENARTEN) {
    const vorgeschlagen = vorschlag?.zeilen.find((z) => z.param === k.param)?.anteil;
    const text = sp[k.param] ?? (vorgeschlagen !== null && vorgeschlagen !== undefined ? String(Math.round(vorgeschlagen * 100)) : "");
    feldWert[k.param] = text;
    const prozentWert = leseZahl(text);
    if (prozentWert !== null) parameter.kostenAnteile[k.name] = Math.max(0, prozentWert) / 100;
  }
  const vorschlagLink = `/kontoprognose?${new URLSearchParams([
    ["monate", String(monate)],
    ["nk", parameter.nkAusgleich],
    ["vorschlag", "1"],
    ...(["weiterleitung"] as const).flatMap((n) => (sp[n] ? [[n, sp[n] as string] as [string, string]] : [])),
  ]).toString()}`;

  const ergebnis = angefordert ? await ladeKontoprognose(parameter) : null;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kontoprognose</h1>
      <p className="mb-6 max-w-3xl text-sm text-neutral-400">
        Schreibt den simulierten Kontostand (siehe{" "}
        <Link href="/kontostand" prefetch={false} className="underline hover:text-white">
          Kontostand
        </Link>
        ) Monat für Monat in die Zukunft fort: erwartete Mieteingänge, laufende Kosten, Darlehensraten laut Tilgungsplan, Weiterleitung an die
        Eigentümerin und der Nebenkostenausgleich. Das ist eine Schätzung aus den Zahlen der letzten Monate, keine Zusage — die Annahmen stehen
        unter dem Diagramm und lassen sich hier überschreiben.
      </p>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4">
        <div>
          <label htmlFor="monate" className="mb-1 block text-xs text-neutral-400">
            Zeitraum
          </label>
          <select id="monate" name="monate" defaultValue={String(monate)} className={feld}>
            {[6, 12, 18, 24].map((m) => (
              <option key={m} value={m} className="bg-neutral-950">
                {m} Monate
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="weiterleitung" className="mb-1 block text-xs text-neutral-400">
            Weiterleitung je Monat (€)
          </label>
          <input id="weiterleitung" type="text" inputMode="decimal" name="weiterleitung" defaultValue={sp.weiterleitung ?? ""} placeholder="automatisch" className={`w-36 ${feld}`} />
        </div>
        <div>
          <label htmlFor="nk" className="mb-1 block text-xs text-neutral-400">
            Nebenkostenausgleich
          </label>
          <select id="nk" name="nk" defaultValue={parameter.nkAusgleich} className={feld}>
            <option value="vorjahr" className="bg-neutral-950">
              wie im Vorjahr
            </option>
            <option value="keiner" className="bg-neutral-950">
              nicht berücksichtigen
            </option>
          </select>
        </div>
        {ANPASSBARE_KOSTENARTEN.map((k) => (
          <div key={k.param}>
            <label
              htmlFor={k.param}
              className="mb-1 block text-xs text-neutral-400"
              title="Anteil der bisherigen Höhe (letzte 12 Monate): 100 = unverändert, 50 = halbiert, 0 = entfällt."
            >
              {k.name} (% von bisher)
            </label>
            <input id={k.param} type="text" inputMode="decimal" name={k.param} defaultValue={feldWert[k.param]} placeholder="100" className={`w-36 ${feld}`} />
          </div>
        ))}
        {mitVorschlag && <input type="hidden" name="vorschlag" value="1" />}
        <div className="w-full text-xs text-neutral-500">
          <Link href={vorschlagLink} prefetch={false} className="underline hover:text-white">
            Vorschlag aus den Monaten seit der Übernahme der Verwaltung einsetzen
          </Link>{" "}
          (und gleich berechnen)
        </div>
        <button type="submit" className="h-9 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-neutral-200">
          {angefordert ? "Neu berechnen" : "Prognose berechnen"}
        </button>
      </form>

      <details className="mb-6 rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
        <summary className="cursor-pointer font-medium text-white">Was bedeuten die Felder?</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-white">Weiterleitung je Monat:</span> was monatlich an die Eigentümerin überwiesen wird. Leer = typischer Betrag der letzten 3 Monate (Median).
          </li>
          <li>
            <span className="text-white">Nebenkostenausgleich:</span> Guthaben-Auszahlungen und Nachzahlungen aus der Abrechnung. „Wie im Vorjahr“ plant dieselben Beträge im selben Monat ein; die Höhe der nächsten Abrechnung ist offen.
          </li>
          <li>
            <span className="text-white">Verwaltungskosten, Reparaturen, Sonstige Kosten (% von bisher):</span> diese Kostenarten waren beim Vorverwalter besonders hoch. Hier tragen Sie ein, wie viel davon künftig noch anfällt, bezogen auf
            die letzten 12 Monate: 100 = unverändert (leer), 50 = halbiert, 0 = entfällt ganz. Alle anderen Kostenarten bleiben, wie sie waren.
          </li>
        </ul>
      </details>

      {!angefordert && <p className="text-sm text-neutral-500">Die Prognose wird erst nach „Prognose berechnen“ gerechnet.</p>}

      {angefordert && !ergebnis && (
        <p className="max-w-xl text-sm text-neutral-400">
          Für die Prognose fehlt der Referenzpunkt des Kontostands. Trag ihn unter{" "}
          <Link href="/objekt" prefetch={false} className="underline hover:text-white">
            Objekt-Einstellungen
          </Link>{" "}
          ein.
        </p>
      )}

      {vorschlag && <VorschlagBox v={vorschlag} />}

      {ergebnis && <Ergebnis e={ergebnis} />}
    </div>
  );
}

function Ergebnis({ e }: { e: NonNullable<Awaited<ReturnType<typeof ladeKontoprognose>>> }) {
  const { prognose, parameter } = e;
  const letzter = prognose.monate.at(-1);
  const tiefster = prognose.niedrigster;
  const unterGrenze = prognose.monate.filter((m) => m.unterMindestbestand);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Karte titel="Kontostand heute (simuliert)" wert={euro0(e.startStand)} text={e.letzteBuchung ? `nach den Buchungen bis ${datum(e.letzteBuchung)}` : undefined} />
        <Karte
          titel={letzter ? `Ende ${monatLang(letzter.jahr, letzter.monat)}` : "Ende"}
          wert={letzter ? euro0(letzter.endstand) : "–"}
          farbe={letzter ? betragFarbe(letzter.endstand - e.startStand) : undefined}
          text={letzter ? `${letzter.endstand - e.startStand >= 0 ? "+" : "−"}${euro0(Math.abs(letzter.endstand - e.startStand))} gegenüber heute` : undefined}
        />
        <Karte
          titel="Niedrigster Stand"
          wert={tiefster ? euro0(tiefster.stand) : "–"}
          farbe={tiefster && tiefster.stand < 0 ? "text-red-400" : undefined}
          text={tiefster ? `Ende ${monatLang(tiefster.jahr, tiefster.monat)}` : undefined}
        />
        <Karte
          titel="Monate unter 0 €"
          wert={String(unterGrenze.length)}
          farbe={unterGrenze.length > 0 ? "text-red-400" : "text-green-400"}
          text={unterGrenze.length > 0 ? `erstmals Ende ${monatLang(unterGrenze[0].jahr, unterGrenze[0].monat)}` : "in diesem Zeitraum nie"}
        />
      </div>

      <div className="rounded-lg border border-neutral-800 p-4">
        <KontoprognoseChart
          start={{ label: "heute", stand: e.startStand, tooltip: `Heute: ${euro2(e.startStand)}` }}
          punkte={prognose.monate.map((m) => ({
            label: monatKurz(m.jahr, m.monat),
            stand: m.endstand,
            tooltip: `Ende ${monatLang(m.jahr, m.monat)}: ${euro2(m.endstand)} (${m.veraenderung >= 0 ? "+" : "−"}${euro2(Math.abs(m.veraenderung))} im Monat)`,
          }))}
          mindestbestand={0}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Monat</th>
              <th className="px-4 py-2 text-right">Mieteingang</th>
              <th className="px-4 py-2 text-right">Laufende Kosten</th>
              <th className="px-4 py-2 text-right">Darlehensraten</th>
              <th className="px-4 py-2 text-right">Weiterleitung</th>
              <th className="px-4 py-2 text-right">Nebenkostenausgleich</th>
              <th className="px-4 py-2 text-right">Veränderung</th>
              <th className="px-4 py-2 text-right">Kontostand Monatsende</th>
            </tr>
          </thead>
          <tbody>
            {prognose.monate.map((m) => (
              <tr key={m.index} className="border-t border-neutral-800">
                <td className="whitespace-nowrap px-4 py-2 text-white">
                  {monatLang(m.jahr, m.monat)}
                  {m.laufend && (
                    <span className="ml-2 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300" title="Der laufende Monat: nur, was noch aussteht (Gebuchtes steckt im Kontostand heute).">
                      Rest
                    </span>
                  )}
                </td>
                <Zelle v={m.miete} />
                <Zelle v={m.kosten} />
                <Zelle v={m.darlehen} />
                <Zelle v={m.weiterleitung} />
                <Zelle v={m.nkAusgleich} />
                <td className={`px-4 py-2 text-right ${betragFarbe(m.veraenderung)}`}>{euro0(m.veraenderung)}</td>
                <td className={`px-4 py-2 text-right font-medium ${m.unterMindestbestand ? "text-red-400" : "text-white"}`}>{euro0(m.endstand)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-neutral-700 text-neutral-300">
            <tr>
              <td className="px-4 py-2 font-medium">Summe</td>
              <Zelle v={prognose.summe.miete} />
              <Zelle v={prognose.summe.kosten} />
              <Zelle v={prognose.summe.darlehen} />
              <Zelle v={prognose.summe.weiterleitung} />
              <Zelle v={prognose.summe.nkAusgleich} />
              <td className={`px-4 py-2 text-right font-medium ${betragFarbe((letzter?.endstand ?? e.startStand) - e.startStand)}`}>
                {euro0((letzter?.endstand ?? e.startStand) - e.startStand)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
        <h2 className="mb-2 text-sm font-medium text-white">Annahmen</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-white">Mieteingang:</span> Soll der {e.vertraegeInPrognose} laufenden bzw. geplanten Mietverträge (Kaltmiete, Nebenkosten, Umsatzsteuer; bereits
            eingetragene Mieterhöhungen und Vertragsenden sind berücksichtigt) mal Zahlungsquote{" "}
            <span className="text-white">{prozent(e.quote)}</span> (der Anteil des Solls, der in den letzten 6 Monaten tatsächlich einging, höchstens 100 %; Rückstände und Ausfälle drücken ihn). Leerstehende Wohnungen
            werden nicht neu vermietet.
          </li>
          <li>
            <span className="text-white">Laufende Kosten:</span> aus den letzten 12 Monaten je Kostenart. Was in mindestens 8 davon gebucht wurde, gilt als regelmäßig (Monatsmittel),
            alles andere kommt im jeweiligen Vorjahresmonat wieder. Darlehenszinsen stecken nicht darin, sie stehen bei den Darlehensraten.
          </li>
          {e.kostenAngepasst.length > 0 && (
            <li>
              <span className="text-white">Von Hand angepasst:</span>{" "}
              {e.kostenAngepasst.map((k) => `${k.kostenart} auf ${prozent(k.anteil)} (bisher ${euro0(k.summe / 12)} je Monat im Mittel)`).join(", ")} — zusammen{" "}
              {euro0(e.kostenAngepasst.reduce((s, k) => s + k.summe * (1 - k.anteil), 0) / 12)} je Monat weniger als nach den Zahlen der letzten 12 Monate.
            </li>
          )}
          <li>
            <span className="text-white">Darlehensraten:</span> laut Tilgungsplan der aktiven Darlehen ({e.darlehensraten.length} Raten im Zeitraum), soweit für den Monat noch nicht gebucht; ab
            dem Wechsel aufs Mietkonto.
          </li>
          <li>
            <span className="text-white">Weiterleitung an die Eigentümerin:</span> {euro0(e.weiterleitung.verwendet)} je Monat
            {parameter.weiterleitung === null
              ? ` (automatisch: Median der letzten ${e.weiterleitung.monateGrundlage} Monate)`
              : ` (von Hand; automatisch wären ${euro0(e.weiterleitung.automatisch)})`}
            .
          </li>
          <li>
            <span className="text-white">Nebenkostenausgleich:</span>{" "}
            {parameter.nkAusgleich === "vorjahr"
              ? `wie in den letzten 12 Monaten (insgesamt ${euro0(e.nkVorjahr)}), im jeweils gleichen Monat. Wie hoch Guthaben und Nachzahlungen der nächsten Abrechnung ausfallen, ist offen — im Zweifel mit dem Vorjahreswert planen.`
              : "nicht berücksichtigt."}
          </li>
          <li>
            <span className="text-white">Nicht enthalten:</span> Kautionen (eigenes Konto), neue Mieterhöhungen, Neuvermietungen, geplante Großreparaturen oder Sondertilgungen und Steuern.
          </li>
        </ul>
      </div>

      <details className="rounded-lg border border-neutral-800 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white">Grundlage der Kostenschätzung ({e.kosten.length} Kostenarten)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="py-2 pr-4">Kostenart</th>
                <th className="px-4 py-2">Ansatz</th>
                <th className="px-4 py-2 text-right">Monate mit Buchung (von 12)</th>
                <th className="px-4 py-2 text-right">Summe 12 Monate</th>
                <th className="px-4 py-2 text-right">Je Monat im Mittel</th>
              </tr>
            </thead>
            <tbody>
              {e.kosten.map((k) => (
                <tr key={k.kostenart} className="border-t border-neutral-800">
                  <td className="py-2 pr-4 text-white">{k.kostenart}</td>
                  <td className="px-4 py-2 text-neutral-400">{k.art === "regelmaessig" ? "regelmäßig: Monatsmittel" : "unregelmäßig: Vorjahresmonat"}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{k.monateMitBuchung}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{euro0(k.summe)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{euro0(k.summe / 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {e.darlehensraten.length > 0 && (
        <details className="rounded-lg border border-neutral-800 p-4">
          <summary className="cursor-pointer text-sm font-medium text-white">Darlehensraten im Zeitraum (Zins und Tilgung)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="py-2 pr-4">Monat</th>
                  <th className="px-4 py-2">Darlehen</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">davon Zinsen</th>
                  <th className="px-4 py-2 text-right">davon Tilgung</th>
                </tr>
              </thead>
              <tbody>
                {e.darlehensraten
                  .slice()
                  .sort((a, b) => a.index - b.index || a.darlehen.localeCompare(b.darlehen))
                  .map((r, i) => {
                    const { jahr, monat } = indexZuMonat(r.index);
                    return (
                      <tr key={`${r.index}-${r.darlehen}-${i}`} className="border-t border-neutral-800">
                        <td className="py-2 pr-4 text-white">{monatLang(jahr, monat)}</td>
                        <td className="px-4 py-2 text-neutral-300">{r.darlehen}</td>
                        <td className="px-4 py-2 text-right text-neutral-300">{euro2(r.rate)}</td>
                        <td className="px-4 py-2 text-right text-neutral-400">{euro2(r.zins)}</td>
                        <td className="px-4 py-2 text-right text-neutral-400">{euro2(r.tilgung)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Karte({ titel, wert, text, farbe }: { titel: string; wert: string; text?: string; farbe?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <p className="text-xs text-neutral-400">{titel}</p>
      <p className={`mt-1 text-lg font-semibold ${farbe ?? "text-white"}`}>{wert}</p>
      {text && <p className="mt-0.5 text-xs text-neutral-500">{text}</p>}
    </div>
  );
}

function Zelle({ v }: { v: number }) {
  return <td className={`px-4 py-2 text-right ${v === 0 ? "text-neutral-600" : "text-neutral-200"}`}>{v === 0 ? "–" : euro0(v)}</td>;
}

function VorschlagBox({ v }: { v: NonNullable<Awaited<ReturnType<typeof ladeKostenVorschlag>>> }) {
  const uebernahme = monatLang(VERWALTUNG_UEBERNOMMEN.jahr, VERWALTUNG_UEBERNOMMEN.monat);
  if (v.zeilen.length === 0) {
    return (
      <p className="mb-6 rounded-lg border border-neutral-800 p-4 text-sm text-neutral-400">
        Für einen Vorschlag braucht es mindestens einen vollen Monat seit der Übernahme der Verwaltung ({uebernahme}). Der laufende Monat zählt noch nicht.
      </p>
    );
  }
  return (
    <div className="mb-6 rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-sm font-medium text-white">Vorschlag aus den Monaten seit der Übernahme der Verwaltung</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Verglichen werden die {v.monateSeit} volle{v.monateSeit === 1 ? "r" : ""} Monat{v.monateSeit === 1 ? "" : "e"} seit {uebernahme} (ohne den laufenden Monat) mit dem Monatsmittel der 12 Monate davor. Die Felder oben sind
        mit dem Ergebnis belegt und lassen sich ändern.
      </p>
      {v.monateSeit < 3 && (
        <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          Noch wenig Grundlage ({v.monateSeit} Monat{v.monateSeit === 1 ? "" : "e"}): Reparaturen schwanken stark von Monat zu Monat, und Rechnungen oder Gutschriften aus der Zeit des Vorverwalters können noch nachlaufen. Die Werte
          sind ein Anhaltspunkt, kein Ergebnis. Mit jedem weiteren vollen Monat wird der Vorschlag belastbarer.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-4">Kostenart</th>
              <th className="px-4 py-2 text-right">Bisher je Monat (12 Monate vor Übernahme)</th>
              <th className="px-4 py-2 text-right">Seit Übernahme je Monat</th>
              <th className="px-4 py-2 text-right">Vorschlag</th>
            </tr>
          </thead>
          <tbody>
            {v.zeilen.map((z) => (
              <tr key={z.param} className="border-t border-neutral-800">
                <td className="py-2 pr-4 text-white">{z.kostenart}</td>
                <td className="px-4 py-2 text-right text-neutral-300">{euro0(z.vorherJeMonat)}</td>
                <td className="px-4 py-2 text-right text-neutral-300">{euro0(z.seitJeMonat)}</td>
                <td className="px-4 py-2 text-right text-white">{z.anteil === null ? "–" : prozent(z.anteil)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Eine Gutschrift im Zeitraum (negativer Betrag) ergibt 0 %. Ein Vorschlag über 100 % heißt, dass die Kosten seit der Übernahme höher liegen als vorher.</p>
    </div>
  );
}
