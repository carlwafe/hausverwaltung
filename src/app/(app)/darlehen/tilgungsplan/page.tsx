import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { formatEuro } from "@/lib/dokumente-anzeige";
import { DeleteButton } from "@/components/delete-button";
import { baueDarlehenskonto, zaehleOffeneMonate, type Darlehenskonto } from "@/lib/darlehenskonto";
import { ladeDarlehenIst } from "@/lib/darlehenskonto-laden";
import {
  berechneTilgungsplan,
  jahressummen,
  restschuldAm,
  vergleicheMitBank,
  type Bankwert,
  type TilgungsplanEingabe,
  type Zinsstufe,
} from "@/lib/tilgungsplan";
import { MIETKONTO_AB } from "@/lib/darlehenskonto";
import { DarlehenForm, type DarlehenFormWerte } from "./darlehen-form";
import { loescheDarlehen } from "./actions";

type Suche = { darlehen?: string; jahr?: string; neu?: string; bearbeiten?: string };

const datumText = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const prozent = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
const zelle = "whitespace-nowrap px-4 py-2 text-right text-white";
const kopf = "px-4 py-2 text-right";

// Darlehen der Vermieterin mit nachgerechnetem Tilgungsplan: Die Bank zeigt ab einem Stichtag nur noch Jahressummen,
// hier steht jede Rate mit Zins- und Tilgungsanteil (Rechenregel und Prüfung: src/lib/tilgungsplan.ts).
export default async function TilgungsplanSeite({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const kannBearbeiten = !!user && user.role !== "GAST";
  const alle = await prisma.darlehen.findMany({ orderBy: [{ aktiv: "desc" }, { bezeichnung: "asc" }] });

  const eingabe = (d: (typeof alle)[number]): TilgungsplanEingabe => ({
    startRestschuld: Number(d.startRestschuld),
    startDatum: d.startDatum,
    rate: Number(d.rate),
    zinssatz: Number(d.zinssatz),
    zahltag: d.zahltag,
    laufzeitEnde: d.laufzeitEnde,
    zinsbindungBis: d.zinsbindungBis,
    stufen: (d.stufen as Zinsstufe[] | null) ?? [],
  });

  // Formular zum Anlegen/Bearbeiten
  if (kannBearbeiten && (sp.neu || sp.bearbeiten)) {
    const d = sp.bearbeiten ? alle.find((x) => x.id === sp.bearbeiten) : undefined;
    const werte: DarlehenFormWerte | undefined = d
      ? {
          id: d.id,
          bezeichnung: d.bezeichnung,
          darlehensnummer: d.darlehensnummer ?? "",
          bank: d.bank ?? "",
          darlehensbetrag: Number(d.darlehensbetrag),
          startRestschuld: Number(d.startRestschuld),
          startDatum: iso(d.startDatum),
          rate: Number(d.rate),
          zinssatz: Number(d.zinssatz),
          zahltag: d.zahltag,
          zinsbindungBis: iso(d.zinsbindungBis),
          laufzeitEnde: iso(d.laufzeitEnde),
          bemerkung: d.bemerkung ?? "",
          aktiv: d.aktiv,
          stufen: (d.stufen as Zinsstufe[] | null) ?? [],
          bankwerte: (d.bankwerte as Bankwert[] | null) ?? [],
        }
      : undefined;
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-white">{werte ? "Darlehen bearbeiten" : "Darlehen anlegen"}</h1>
        <DarlehenForm werte={werte} />
      </div>
    );
  }

  const jetzt = new Date();
  const heute = new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate()));
  const plaene = alle.map((d) => {
    const e = eingabe(d);
    const raten = berechneTilgungsplan(e);
    const summen = jahressummen(raten);
    return { d, e, raten, summen, vergleich: vergleicheMitBank(summen, (d.bankwerte as Bankwert[] | null) ?? []) };
  });
  const aktive = plaene.filter((p) => p.d.aktiv);
  const istJeDarlehen = await ladeDarlehenIst();

  const alleJahre = new Set<number>([heute.getUTCFullYear()]);
  for (const p of plaene) for (const s of p.summen) alleJahre.add(s.jahr);
  const jahre = [...alleJahre].sort((a, b) => a - b);
  const jahr = jahre.includes(Number(sp.jahr)) ? Number(sp.jahr) : heute.getUTCFullYear();
  const gewaehlt = plaene.find((p) => p.d.id === sp.darlehen);

  const jahrZeilen = aktive.map((p) => {
    const s = p.summen.find((x) => x.jahr === jahr);
    const davor = p.summen.filter((x) => x.jahr < jahr).pop();
    const vgl = p.vergleich.find((v) => v.jahr === jahr);
    return { p, zins: s?.zins ?? 0, tilgung: s?.tilgung ?? 0, rate: s?.rate ?? 0, rest: s?.restschuld ?? davor?.restschuld ?? Number(p.d.startRestschuld), vgl };
  });
  const summe = (f: (z: (typeof jahrZeilen)[number]) => number) => Math.round(jahrZeilen.reduce((s, z) => s + f(z), 0) * 100) / 100;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Darlehen &amp; Tilgungspläne</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            Die Darlehen der Vermieterin mit nachgerechnetem Tilgungsplan. Die Bank druckt ab einem Stichtag nur noch
            Jahressummen; hier steht jede Rate mit Zins- und Tilgungsanteil, gerechnet aus Restschuld, Zinssatz und Rate
            (Zins = Restschuld × Satz ÷ 12). Die Rechnung gibt den Plan der Bank auf den Cent wieder, ersetzt aber nicht
            die Bescheinigung: Nach Ende der Zinsbindung oder bei Sondertilgungen den neuen Stand eintragen. Gebuchte
            Raten stehen unter Finanzen → Darlehen.
          </p>
        </div>
        {kannBearbeiten && (
          <Link href="/darlehen/tilgungsplan?neu=1" prefetch={false} className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900">
            Darlehen anlegen
          </Link>
        )}
      </div>

      {plaene.length === 0 ? (
        <p className="text-sm text-neutral-400">Noch kein Darlehen angelegt.</p>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap gap-2 text-sm">
            {jahre.map((j) => (
              <Link key={j} prefetch={false} href={`/darlehen/tilgungsplan?jahr=${j}${gewaehlt ? `&darlehen=${gewaehlt.d.id}` : ""}`} className={j === jahr ? "font-medium text-white underline" : "text-neutral-400 hover:text-white"}>
                {j}
              </Link>
            ))}
          </p>

          <div className="overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2 text-left">Darlehen</th>
                  <th className={kopf}>Zinssatz</th>
                  <th className={kopf}>Rate</th>
                  <th className={kopf}>Zinsen {jahr}</th>
                  <th className={kopf}>Tilgung {jahr}</th>
                  <th className={kopf}>Restschuld 31.12.{jahr}</th>
                  <th className={kopf}>Restschuld heute</th>
                  <th className={kopf}>Bank</th>
                  <th className={kopf}>Konto</th>
                </tr>
              </thead>
              <tbody>
                {jahrZeilen.map(({ p, zins, tilgung, rest, vgl }) => {
                  const imJahr = p.raten.filter((r) => r.jahr === jahr);
                  const satz = imJahr.at(-1)?.zinssatz ?? Number(p.d.zinssatz);
                  const rate = imJahr.length ? Math.max(...imJahr.map((r) => r.rate)) : Number(p.d.rate);
                  return (
                    <tr key={p.d.id} className="border-t border-neutral-800">
                      <td className="px-4 py-2">
                        <Link prefetch={false} href={`/darlehen/tilgungsplan?jahr=${jahr}&darlehen=${p.d.id}`} className={`underline hover:text-neutral-300 ${p.d.id === gewaehlt?.d.id ? "font-medium text-white" : "text-neutral-200"}`}>
                          {p.d.bezeichnung}
                        </Link>
                        {p.d.darlehensnummer && <span className="ml-2 text-xs text-neutral-500">{p.d.darlehensnummer}</span>}
                      </td>
                      <td className={zelle}>{prozent(satz)}</td>
                      <td className={zelle}>{formatEuro(rate)}</td>
                      <td className={zelle}>{formatEuro(zins)}</td>
                      <td className={zelle}>{formatEuro(tilgung)}</td>
                      <td className={zelle}>{formatEuro(rest)}</td>
                      <td className={zelle}>{formatEuro(restschuldAm(p.e, p.raten, heute))}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                        {!vgl ? <span className="text-neutral-500">–</span> : vgl.stimmt ? <span className="text-green-400">stimmt ✓</span> : <span className="text-amber-400">Abweichung</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                        {(() => {
                          const ist = istJeDarlehen.get(p.d.id) ?? [];
                          const offen = zaehleOffeneMonate(p.raten, ist, heute);
                          if (offen > 0) return <span className="text-red-400">{offen} Monat{offen === 1 ? "" : "e"} offen</span>;
                          return ist.length ? <span className="text-green-400">gebucht ✓</span> : <span className="text-neutral-500">–</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-neutral-700 font-medium">
                  <td className="px-4 py-2 text-white">Summe {jahr}</td>
                  <td />
                  <td className={zelle}>{formatEuro(summe((z) => z.rate))}</td>
                  <td className={zelle}>{formatEuro(summe((z) => z.zins))}</td>
                  <td className={zelle}>{formatEuro(summe((z) => z.tilgung))}</td>
                  <td className={zelle}>{formatEuro(summe((z) => z.rest))}</td>
                  <td className={zelle}>{formatEuro(Math.round(aktive.reduce((s, p) => s + restschuldAm(p.e, p.raten, heute), 0) * 100) / 100)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 max-w-3xl text-xs text-neutral-500">
            Die Zinsen eines Jahres sind die Zinsen der in diesem Jahr gezahlten Raten, wie in der Zinsbescheinigung der
            Bank (Steuererklärung nach Zahlungsdatum). Die Spalte „Bank“ vergleicht mit den eingetragenen Jahreswerten
            der Bescheinigung.
          </p>

          {gewaehlt ? <Einzelplan p={gewaehlt} stufen={gewaehlt.e.stufen} jahr={jahr} kannBearbeiten={kannBearbeiten} konto={baueDarlehenskonto(gewaehlt.raten, istJeDarlehen.get(gewaehlt.d.id) ?? [], Number(gewaehlt.d.startRestschuld), jahr, heute)} /> : <p className="mt-8 text-sm text-neutral-400">Darlehen in der Tabelle anklicken, um alle Raten zu sehen.</p>}

          {plaene.some((p) => !p.d.aktiv) && (
            <p className="mt-8 text-sm text-neutral-500">
              Inaktiv: {plaene.filter((p) => !p.d.aktiv).map((p) => (
                <Link key={p.d.id} prefetch={false} href={`/darlehen/tilgungsplan?jahr=${jahr}&darlehen=${p.d.id}`} className="mr-3 underline hover:text-neutral-300">{p.d.bezeichnung}</Link>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Einzelplan({ p, stufen, jahr, kannBearbeiten, konto }: { p: { d: { id: string; bezeichnung: string; darlehensnummer: string | null; bank: string | null; darlehensbetrag: unknown; startRestschuld: unknown; startDatum: Date; zinssatz: unknown; zinsbindungBis: Date | null; laufzeitEnde: Date | null; bemerkung: string | null; zahltag: number }; raten: ReturnType<typeof berechneTilgungsplan>; summen: ReturnType<typeof jahressummen>; vergleich: ReturnType<typeof vergleicheMitBank> }; stufen: Zinsstufe[]; jahr: number; kannBearbeiten: boolean; konto: Darlehenskonto }) {
  const { d } = p;
  const imJahr = p.raten.filter((r) => r.jahr === jahr);
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-white">{d.bezeichnung}</h2>
        {kannBearbeiten && (
          <div className="flex items-center gap-2">
            <Link href={`/darlehen/tilgungsplan?bearbeiten=${d.id}`} prefetch={false} className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900">Bearbeiten</Link>
            <DeleteButton size="sm" confirmText="Darlehen samt Tilgungsplan löschen? Gebuchte Raten bleiben unberührt." action={loescheDarlehen.bind(null, d.id) as unknown as () => Promise<void>} />
          </div>
        )}
      </div>
      <dl className="mt-3 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {[
          ["Darlehensbetrag", formatEuro(Number(d.darlehensbetrag))],
          ["Ausgangsstand", `${formatEuro(Number(d.startRestschuld))} am ${datumText(d.startDatum)}`],
          ["Sollzinssatz", prozent(Number(d.zinssatz))],
          ["Zahltag", `${d.zahltag}. (Wochenende → Montag)`],
          ["Zinsbindung bis", d.zinsbindungBis ? datumText(d.zinsbindungBis) : "–"],
          ["Laufzeitende", d.laufzeitEnde ? datumText(d.laufzeitEnde) : "–"],
          ["Darlehensnummer", d.darlehensnummer ?? "–"],
          ["Bank", d.bank ?? "–"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-neutral-400">{k}</dt>
            <dd className="text-white">{v}</dd>
          </div>
        ))}
      </dl>
      {stufen.length > 0 && (
        <p className="mt-2 text-sm text-neutral-300">
          Änderungen: {stufen.map((s) => `ab ${datumText(new Date(`${s.ab}T00:00:00Z`))} ${prozent(s.zinssatz)}${s.rate !== undefined ? `, Rate ${formatEuro(s.rate)}` : ""}`).join("; ")}
        </p>
      )}
      {d.bemerkung && <p className="mt-2 max-w-3xl text-sm text-neutral-400">{d.bemerkung}</p>}

      <h3 className="mt-6 text-sm font-medium text-white">Darlehenskonto {jahr}: Soll (Plan) und Ist (gebucht)</h3>
      <p className="mt-1 max-w-3xl text-xs text-neutral-500">
        Soll = Rate laut Tilgungsplan. Ist = die über das Mietkonto gebuchte Rate, dem Monat zugeordnet, für den sie gezahlt
        wurde (beim Import wählbar, auf der Seite der Zahlung änderbar oder auf mehrere Monate aufteilbar). Gebucht wird erst
        ab {String(MIETKONTO_AB.monat).padStart(2, "0")}/{MIETKONTO_AB.jahr}; davor liefen die Darlehen über ein anderes Konto.
      </p>
      {konto.zeilen.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-400">Für {jahr} gibt es keine Raten (vor dem Ausgangsstand oder nach Laufzeitende).</p>
      ) : (
        <div className="mt-2 overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2 text-left">Monat</th>
                <th className={kopf}>Zinssatz</th>
                <th className={kopf}>Soll Rate</th>
                <th className={kopf}>Soll Zinsen</th>
                <th className={kopf}>Soll Tilgung</th>
                <th className={kopf}>Ist Rate</th>
                <th className={kopf}>Ist Zinsen</th>
                <th className={kopf}>Ist Tilgung</th>
                <th className={kopf}>Restschuld Plan</th>
                <th className={kopf}>Restschuld Ist</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {konto.zeilen.map((z) => {
                const diff = z.ist && z.soll ? Math.round((z.ist.rate - z.soll.rate) * 100) / 100 : null;
                const diffZins = z.ist && z.soll ? Math.round((z.ist.zins - z.soll.zins) * 100) / 100 : null;
                return (
                  <tr key={z.monat} className="border-t border-neutral-800">
                    <td className="whitespace-nowrap px-3 py-2 text-white">
                      {String(z.monat).padStart(2, "0")}/{z.jahr}
                      {z.planDatum && <span className="ml-2 text-xs text-neutral-500">{datumText(z.planDatum)}</span>}
                    </td>
                    <td className={zelle}>{z.zinssatz !== null ? prozent(z.zinssatz) : "–"}{z.nachZinsbindung && <span title="Zinssatz nach Ende der Zinsbindung nur angenommen" className="text-amber-400"> *</span>}</td>
                    <td className={`${zelle} text-neutral-300`}>{z.soll ? formatEuro(z.soll.rate) : "–"}</td>
                    <td className={`${zelle} text-neutral-300`}>{z.soll ? formatEuro(z.soll.zins) : "–"}</td>
                    <td className={`${zelle} text-neutral-300`}>{z.soll ? formatEuro(z.soll.tilgung) : "–"}</td>
                    <td className={zelle}>
                      {z.ist ? (
                        <>
                          <Link prefetch={false} href={`/darlehen/rate/${z.ist.ankerIds[0]}`} className="underline hover:text-neutral-300">
                            {formatEuro(z.ist.rate)}
                          </Link>
                          {z.ist.ankerIds.length > 1 && <span className="ml-1 text-xs text-neutral-500">({z.ist.ankerIds.length} Zahlungen)</span>}
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={zelle}>{z.ist ? formatEuro(z.ist.zins) : "–"}</td>
                    <td className={zelle}>{z.ist ? formatEuro(z.ist.tilgung) : "–"}</td>
                    <td className={`${zelle} text-neutral-300`}>{z.restschuldPlan !== null ? formatEuro(z.restschuldPlan) : "–"}</td>
                    <td className={zelle}>{z.restschuldIst !== null ? formatEuro(z.restschuldIst) : "–"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {z.status === "ok" && <span className="text-green-400">gebucht ✓</span>}
                      {z.status === "abweichung" && (
                        <span className="text-amber-400">
                          Abweichung
                          {diff !== null && Math.abs(diff) >= 0.005 ? ` Rate ${diff > 0 ? "+" : ""}${formatEuro(diff)}` : ""}
                          {diffZins !== null && Math.abs(diffZins) >= 0.005 ? ` · Zinsen ${diffZins > 0 ? "+" : ""}${formatEuro(diffZins)}` : ""}
                          {!z.soll ? " (keine Rate im Plan)" : ""}
                        </span>
                      )}
                      {z.status === "offen" && <span className="text-red-400">offen – nicht gebucht</span>}
                      {z.status === "bevorstehend" && <span className="text-neutral-500">steht aus</span>}
                      {z.status === "nicht-im-journal" && <span className="text-neutral-600">anderes Konto</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-700 font-medium">
                <td className="px-3 py-2 text-white">Summe ab {String(MIETKONTO_AB.monat).padStart(2, "0")}/{MIETKONTO_AB.jahr}</td>
                <td />
                <td className={zelle}>{formatEuro(konto.summeSoll.rate)}</td>
                <td className={zelle}>{formatEuro(konto.summeSoll.zins)}</td>
                <td className={zelle}>{formatEuro(konto.summeSoll.tilgung)}</td>
                <td className={zelle}>{formatEuro(konto.summeIst.rate)}</td>
                <td className={zelle}>{formatEuro(konto.summeIst.zins)}</td>
                <td className={zelle}>{formatEuro(konto.summeIst.tilgung)}</td>
                <td colSpan={3} />
              </tr>
              <tr className="border-t border-neutral-800 text-neutral-400">
                <td className="px-3 py-2">Plan {jahr} gesamt</td>
                <td />
                <td className={zelle}>{formatEuro(konto.sollJahr.rate)}</td>
                <td className={zelle}>{formatEuro(konto.sollJahr.zins)}</td>
                <td className={zelle}>{formatEuro(konto.sollJahr.tilgung)}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {konto.sonder.length > 0 && (
        <div className="mt-3 max-w-3xl">
          <h4 className="text-xs font-medium text-neutral-300">Sonderbuchungen {jahr} (z.B. Verzugszinsen, nicht im Soll)</h4>
          <ul className="mt-1 text-sm">
            {konto.sonder.map((i) => (
              <li key={i.ankerId} className="flex justify-between gap-4 border-b border-neutral-800 py-1 text-neutral-300">
                <span>
                  {datumText(i.datum)} · {i.text}
                </span>
                <Link prefetch={false} href={`/darlehen/rate/${i.ankerId}`} className="whitespace-nowrap text-white underline hover:text-neutral-300">
                  {formatEuro(i.zins + i.tilgung)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {imJahr.some((r) => r.nachZinsbindung) && (
        <p className="mt-2 text-xs text-amber-400">* Die Zinsbindung ist zu diesem Zeitpunkt abgelaufen: Der Zinssatz ist nur angenommen (der der Bank gilt bis zur nächsten Anpassung). Neuen Satz unter „Bearbeiten“ als Änderung eintragen.</p>
      )}

      <h3 className="mt-6 text-sm font-medium text-white">Alle Jahre</h3>
      <div className="mt-2 max-w-4xl overflow-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-2 text-left">Jahr</th>
              <th className={kopf}>Raten</th>
              <th className={kopf}>Zinsen</th>
              <th className={kopf}>Tilgung</th>
              <th className={kopf}>Restschuld 31.12.</th>
              <th className={kopf}>Bank (Zinsen / Tilgung / Restschuld)</th>
            </tr>
          </thead>
          <tbody>
            {p.summen.map((s) => {
              const v = p.vergleich.find((x) => x.jahr === s.jahr);
              return (
                <tr key={s.jahr} className="border-t border-neutral-800">
                  <td className="px-4 py-2">
                    <Link prefetch={false} href={`/darlehen/tilgungsplan?jahr=${s.jahr}&darlehen=${d.id}`} className={`underline hover:text-neutral-300 ${s.jahr === jahr ? "font-medium text-white" : "text-neutral-200"}`}>{s.jahr}</Link>
                  </td>
                  <td className={zelle}>{formatEuro(s.rate)}</td>
                  <td className={zelle}>{formatEuro(s.zins)}</td>
                  <td className={zelle}>{formatEuro(s.tilgung)}</td>
                  <td className={zelle}>{formatEuro(s.restschuld)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                    {!v ? (
                      <span className="text-neutral-500">–</span>
                    ) : v.stimmt ? (
                      <span className="text-green-400">stimmt ✓</span>
                    ) : (
                      <span className="text-amber-400">
                        Bank: {[v.zinsenBank, v.tilgungBank, v.restschuldBank].map((x) => (x === undefined ? "–" : formatEuro(x))).join(" / ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
