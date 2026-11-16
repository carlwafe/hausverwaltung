import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ladeKontostandEintraege, ladeKontostandTagessummen } from "@/lib/buchungsjournal";
import { berechneKontostandVerlaufAb, kontostandAmStichtag } from "@/lib/kontostand";
import { findeSaldoLuecken, ladeKontosalden, standAnTagen } from "@/lib/kontosalden";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { DeleteButton } from "@/components/delete-button";
import { KontostandKontrolleForm } from "./kontostand-kontrolle-form";
import { loescheKontostandKontrolle } from "./actions";
import { KontostandTable, type KontostandRow } from "./kontostand-table";
import { KontostandAnsicht, type AnsichtTab } from "./kontostand-ansicht";
import { KontostandChart } from "./kontostand-chart";
import { SaldenTable, type SaldoRow } from "./salden-table";
import { SaldenEinlesenForm } from "./salden-einlesen-form";
import { KARTE_KENNZEICHEN, KARTE_LISTE, KARTE_RAHMEN, KarteAktionen, KarteKopf, KarteNotiz, KarteWerte } from "@/components/karte";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

// Zeitraumfilter der Tabellen: Der Server schickt nur die Zeilen des Zeitraums (Standard 90 Tage), weil jede Zeile Ladezeit kostet.
const ZEITRAEUME = [
  { wert: "30", label: "30 Tage", tage: 30 },
  { wert: "90", label: "90 Tage", tage: 90 },
  { wert: "365", label: "1 Jahr", tage: 365 },
  { wert: "alle", label: "Alles", tage: null },
];

export default async function KontostandPage({
  searchParams,
}: {
  searchParams: Promise<{ zeitraum?: string; ansicht?: string }>;
}) {
  const { zeitraum: zeitraumParam, ansicht: ansichtParam } = await searchParams;
  const zeitraum = ZEITRAEUME.find((z) => z.wert === zeitraumParam) ?? ZEITRAEUME[1];
  // Ab diesem Tag (ISO) zeigen die Tabellen Zeilen; Stände („Kontostand danach“, Differenz) sind trotzdem über den ganzen Verlauf gerechnet.
  const ab = zeitraum.tage === null ? null : new Date(new Date().getTime() - zeitraum.tage * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [objekt, salden] = await Promise.all([
    prisma.objekt.findFirst({ select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true } }),
    ladeKontosalden(),
  ]);

  // Von Hand gesetzter Anker (Objekt-Einstellungen) — nur noch Rückfall und Grundlage der von Hand eingetragenen Prüfwerte.
  const manuellerAnker =
    objekt?.kontostandAnkerDatum && objekt.kontostandAnkerBetrag !== null
      ? { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) }
      : null;

  // Mit XML-Salden ist der Bankstand des ersten Tages der Anker: Die Buchungen werden ab dort gegen die Bank gerechnet.
  const anker =
    salden.length > 0
      ? { datum: parseStrengesDatum(salden[0].datum)!, betrag: salden[0].endsaldo }
      : manuellerAnker;

  if (!anker) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
        <p className="mb-4 max-w-xl text-sm text-neutral-400">
          Der Kontostand kommt aus den Salden der CAMT-XML-Dateien. Sie werden beim{" "}
          <Link href="/kontoauszug/import" className="underline hover:text-white">
            Kontoauszug-Import
          </Link>{" "}
          gespeichert; für schon importierte Auszüge lassen sie sich hier nachträglich einlesen.
        </p>
        <div className="max-w-xl rounded-lg border border-neutral-800 p-4">
          <SaldenEinlesenForm />
        </div>
      </div>
    );
  }

  // Stände (Anker, Tagesabgleich, Prüfwerte, Stand vor dem Zeitraum) rechnet die Datenbank als Tagessummen; einzeln
  // geladen werden nur die Buchungen des gewählten Zeitraums (siehe docs/kontostand.md → „Darstellung“).
  const abDatum = ab === null ? null : parseStrengesDatum(ab)!;
  const [{ tage: eintraege, anzahl: anzahlBuchungen }, zeitraumEintraege, kontrollen] = await Promise.all([
    ladeKontostandTagessummen(),
    ladeKontostandEintraege(abDatum ?? undefined),
    prisma.kontostandKontrolle.findMany({ orderBy: { datum: "desc" } }),
  ]);
  const verlauf = berechneKontostandVerlaufAb(eintraege, zeitraumEintraege, anker, abDatum ?? new Date(0));

  // Tagesabgleich: Bankstand (XML) gegen den Stand, den die Buchungen der App ergeben.
  const appStaende = standAnTagen(eintraege, anker, salden.map((s) => s.datum));
  const differenzen = salden.map((s, i) => Math.round((appStaende[i] - s.endsaldo) * 100) / 100);
  const saldoZeilen: SaldoRow[] = salden.map((s, i) => ({
    id: s.datum,
    datum: s.datum,
    anfang: s.anfangssaldo,
    umsatz: s.summeUmsaetze,
    anzahl: s.anzahlUmsaetze,
    bank: s.endsaldo,
    app: appStaende[i],
    differenz: differenzen[i],
    neu: i > 0 && Math.abs(differenzen[i] - differenzen[i - 1]) >= 0.005,
  }));
  const letzterTag = saldoZeilen[saldoZeilen.length - 1] ?? null;
  const luecken = findeSaldoLuecken(salden);
  const abweichungen = saldoZeilen.filter((z) => z.neu);

  // Von Hand eingetragene Prüfwerte: simulierter Stand am Ende des Kontrolltags (Buchungen des Tages zählen mit) gegen den echten Stand.
  const kontrollAnker = manuellerAnker ?? anker;
  const kontrollZeilen = kontrollen.map((k) => {
    const simuliert = kontostandAmStichtag(eintraege, kontrollAnker, new Date(k.datum.getTime() + 24 * 60 * 60 * 1000 - 1));
    const bank = Number(k.betrag);
    const differenz = Math.round((simuliert - bank) * 100) / 100;
    return { id: k.id, datum: k.datum, notiz: k.notiz, bank, simuliert, differenz };
  });

  const rows: KontostandRow[] = verlauf
    .slice()
    .reverse()
    .map((z) => ({
      id: z.id,
      datum: z.datum.toISOString(),
      betrag: z.betrag,
      kategorie: z.kategorie,
      beschreibung: z.beschreibung,
      kontostand: z.kontostand,
    }));

  const tageImZeitraum = saldoZeilen.filter((z) => ab === null || z.datum >= ab);
  const zeitraumHinweis = (zeilen: number, gesamt: number, einheit: string) =>
    ab === null
      ? undefined
      : `Zeigt die letzten ${zeitraum.label} (ab ${formatDate(parseStrengesDatum(ab)!)}): ${zeilen} von ${gesamt} ${einheit}. Der Stand ist trotzdem über den ganzen Verlauf gerechnet.`;

  const tabs: AnsichtTab[] = [
    ...(saldoZeilen.length > 0
      ? [
          {
            key: "abweichungen",
            label: "Abweichungen",
            anzahl: abweichungen.length,
            hinweis: "Die Tage, an denen sich die Differenz zur Bank ändert — dort fehlt eine Buchung oder ist falsch erfasst. Über alle Zeiträume.",
            inhalt: <SaldenTable rows={abweichungen} />,
          },
          {
            key: "diagramm",
            label: "Diagramm",
            mitZeitraum: true,
            hinweis: zeitraumHinweis(tageImZeitraum.length, saldoZeilen.length, "Tagen"),
            inhalt: <KontostandChart punkte={tageImZeitraum.map((z) => ({ datum: z.datum, bank: z.bank, app: z.app, neu: z.neu }))} />,
          },
          {
            key: "tage",
            label: "Tagesstände Bank",
            anzahl: tageImZeitraum.length,
            mitZeitraum: true,
            hinweis: zeitraumHinweis(tageImZeitraum.length, saldoZeilen.length, "Tagen"),
            inhalt: <SaldenTable rows={tageImZeitraum} />,
          },
        ]
      : []),
    {
      key: "buchungen",
      label: "Buchungsverlauf",
      anzahl: rows.length,
      mitZeitraum: true,
      hinweis: zeitraumHinweis(rows.length, anzahlBuchungen, "Buchungen"),
      inhalt: <KontostandTable rows={rows} />,
    },
  ];
  // Beim Öffnen zuerst die Abweichungen, wenn es welche gibt; sonst das Diagramm (bzw. der Verlauf ohne Bank-Salden).
  const start = ansichtParam ?? (abweichungen.length > 0 ? "abweichungen" : saldoZeilen.length > 0 ? "diagramm" : "buchungen");

  const aktuellerStand = kontostandAmStichtag(eintraege, anker, new Date(8.64e15));
  const stimmtAktuell = letzterTag ? Math.abs(letzterTag.differenz) < 0.005 : null;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        {letzterTag ? (
          <>
            Der Kontostand kommt aus den Salden der CAMT-XML-Dateien, die beim Kontoauszug-Import gespeichert werden. Die
            Buchungen der App werden ab dem ersten Bankstand ({formatDate(anker.datum)}, {formatEuro(anker.betrag)})
            gegen die Bank gerechnet — wo die Differenz sich ändert, fehlt eine Buchung oder ist falsch erfasst.
          </>
        ) : (
          <>
            Es sind noch keine Bank-Salden gespeichert: Der Verlauf rechnet ab dem von Hand gesetzten Anker am{" "}
            {formatDate(anker.datum)} ({formatEuro(anker.betrag)}). Import per XML oder „Salden einlesen“ unten liefert den
            echten Stand.
          </>
        )}
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {letzterTag && (
          <>
            <div className="rounded-lg border border-neutral-800 p-4">
              <p className="text-xs text-neutral-400">Kontostand laut Bank</p>
              <p className="mt-1 text-lg font-semibold text-white">{formatEuro(letzterTag.bank)}</p>
              <p className="mt-0.5 text-xs text-neutral-500">Ende {formatDate(parseStrengesDatum(letzterTag.datum)!)}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 p-4">
              <p className="text-xs text-neutral-400">Abgleich mit den Buchungen</p>
              <p className={`mt-1 text-lg font-semibold ${stimmtAktuell ? "text-green-400" : "text-red-400"}`}>
                {stimmtAktuell ? "stimmt" : `${formatEuro(letzterTag.differenz)} Differenz`}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {abweichungen.length === 0
                  ? "an keinem Tag eine Abweichung"
                  : `${abweichungen.length} Tag${abweichungen.length === 1 ? "" : "e"} mit neuer Abweichung`}
              </p>
            </div>
          </>
        )}
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Laut Buchungen (alle erfassten)</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(aktuellerStand)}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {letzterTag ? `${salden.length} Tage mit Bankstand, ${formatDate(anker.datum)} bis ${formatDate(parseStrengesDatum(letzterTag.datum)!)}` : "simuliert"}
          </p>
        </div>
      </div>

      {luecken.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-300">
          <p className="font-medium">Es fehlen Kontoauszug-Dateien</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {luecken.map((l) => (
              <li key={`${l.von}-${l.bis}`}>
                Zwischen {formatDate(parseStrengesDatum(l.von)!)} (Endstand {formatEuro(l.endsaldo)}) und{" "}
                {formatDate(parseStrengesDatum(l.bis)!)} (Anfangsstand {formatEuro(l.anfangssaldo)}) passen die Salden nicht
                zusammen.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <KontostandAnsicht tabs={tabs} start={start} zeitraum={zeitraum.wert} zeitraeume={ZEITRAEUME} />
      </div>

      <details className="mb-6 rounded-lg border border-neutral-800 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white">Salden aus XML-Dateien einlesen</summary>
        <p className="mb-3 mt-2 text-xs text-neutral-500">
          Für Auszüge, die schon importiert sind: Die Dateien werden nur gelesen, es wird nichts gebucht. Beim normalen
          Import werden die Salden automatisch gespeichert.
        </p>
        <SaldenEinlesenForm />
      </details>

      <details className="mb-6 rounded-lg border border-neutral-800 p-4" open={kontrollZeilen.length > 0 && !letzterTag}>
        <summary className="cursor-pointer text-sm font-medium text-white">Kontostand von Hand prüfen</summary>
        <p className="mb-3 mt-2 text-xs text-neutral-500">
          Ohne XML: Trag den echten Kontostand von einem Kontoauszug ein (Stand am Ende des Tages). Er wird mit dem
          simulierten Kontostand desselben Tages verglichen — eine Abweichung heißt, dass eine Buchung fehlt oder
          falsch erfasst ist. Die Prüfwerte ändern den Verlauf nicht und gehen in den Jahresbericht ein.
        </p>
        <KontostandKontrolleForm />
        {/* Handy: je Prüfwert eine Karte statt der Tabelle. */}
        {kontrollZeilen.length > 0 && (
          <ul className={`mt-4 ${KARTE_LISTE}`}>
            {kontrollZeilen.map((k) => {
              const stimmt = Math.abs(k.differenz) < 0.005;
              return (
                <li key={k.id} className={KARTE_RAHMEN}>
                  <KarteKopf
                    titel={formatDate(k.datum)}
                    wert={
                      <span
                        className={`${KARTE_KENNZEICHEN} ${stimmt ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                      >
                        {stimmt ? "stimmt" : "Abweichung"}
                      </span>
                    }
                  />
                  <KarteWerte
                    werte={[
                      { label: "Laut Kontoauszug", wert: formatEuro(k.bank) },
                      { label: "Simuliert", wert: formatEuro(k.simuliert) },
                      !stimmt && { label: "Differenz", wert: formatEuro(k.differenz), klasse: "text-red-400" },
                    ]}
                  />
                  {k.notiz && <KarteNotiz>{k.notiz}</KarteNotiz>}
                  <KarteAktionen>
                    <DeleteButton
                      action={loescheKontostandKontrolle.bind(null, k.id)}
                      confirmText="Prüfwert wirklich entfernen?"
                      label="Entfernen"
                    />
                  </KarteAktionen>
                </li>
              );
            })}
          </ul>
        )}
        {kontrollZeilen.length > 0 && (
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="py-2 pr-4">Datum</th>
                  <th className="px-4 py-2 text-right">Laut Kontoauszug</th>
                  <th className="px-4 py-2 text-right">Simuliert</th>
                  <th className="px-4 py-2 text-right">Differenz</th>
                  <th className="px-4 py-2">Ergebnis</th>
                  <th className="px-4 py-2">Notiz</th>
                  <th className="py-2 pl-4" />
                </tr>
              </thead>
              <tbody>
                {kontrollZeilen.map((k) => {
                  const stimmt = Math.abs(k.differenz) < 0.005;
                  return (
                    <tr key={k.id} className="border-t border-neutral-800">
                      <td className="py-2 pr-4 text-white">{formatDate(k.datum)}</td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(k.bank)}</td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(k.simuliert)}</td>
                      <td className={`px-4 py-2 text-right ${stimmt ? "text-neutral-500" : "text-red-400"}`}>
                        {formatEuro(k.differenz)}
                      </td>
                      <td className="px-4 py-2">
                        {stimmt ? (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">stimmt</span>
                        ) : (
                          <span
                            className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
                            title="Simulierter Stand minus Kontoauszug: negativ = im Journal fehlen Einnahmen/es sind zu viele Ausgaben erfasst, positiv = umgekehrt"
                          >
                            Abweichung
                          </span>
                        )}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-2 text-xs text-neutral-500" title={k.notiz ?? ""}>
                        {k.notiz}
                      </td>
                      <td className="py-2 pl-4 text-right">
                        <DeleteButton
                          action={loescheKontostandKontrolle.bind(null, k.id)}
                          confirmText="Prüfwert wirklich entfernen?"
                          label="Entfernen"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
