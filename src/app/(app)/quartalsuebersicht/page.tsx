import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { JahrFilterForm } from "../jahresuebersicht/jahr-filter-form";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const QUARTALE = [0, 1, 2, 3] as const;

type Quartalswerte = [number, number, number, number];
const leer = (): Quartalswerte => [0, 0, 0, 0];
const summe = (w: Quartalswerte) => w[0] + w[1] + w[2] + w[3];

// Quartal (0–3) eines Datums; Grenzen wie in der Jahresübersicht nach Zuflussprinzip.
const quartalVon = (d: Date) => Math.floor(d.getMonth() / 3);

async function ladeQuartale(jahr: number) {
  const jahresanfang = new Date(jahr, 0, 1);
  const jahresende = new Date(jahr + 1, 0, 1);

  const [datumsBasiert, kostenpositionen] = await Promise.all([
    prisma.buchung.findMany({
      where: {
        buchungsart: { eurRelevant: true, code: { not: "KOSTENPOSITION" } },
        datum: { gte: jahresanfang, lt: jahresende },
        ...AKTIVE_BUCHUNG_FILTER,
      },
      select: { datum: true, betrag: true, buchungsart: { select: { code: true } } },
    }),
    // Kosten zählen wie in der Jahresübersicht nach Kostenjahr; für die Quartalszuordnung wird das
    // Buchungsdatum gebraucht. Positionen ohne Datum lassen sich keinem Quartal zuordnen.
    prisma.buchung.findMany({
      where: { buchungsart: { eurRelevant: true, code: "KOSTENPOSITION" }, jahr, ...AKTIVE_BUCHUNG_FILTER },
      include: { kostenart: true },
    }),
  ]);

  const mieteinnahmen = leer();
  const nachzahlungen = leer();
  const guthaben = leer();
  const kautionEinbehalte = leer();
  const sonderzahlungen = leer();
  const sonstigeEinnahmen = leer();
  const sonstigeAusgaben = leer();
  for (const b of datumsBasiert) {
    if (!b.datum) continue;
    const q = quartalVon(b.datum);
    const betrag = Number(b.betrag);
    switch (b.buchungsart.code) {
      case "MIETZAHLUNG":
        mieteinnahmen[q] += betrag;
        break;
      case "NEBENKOSTENAUSGLEICH":
        if (-betrag > 0) guthaben[q] += -betrag;
        else nachzahlungen[q] += betrag;
        break;
      case "KAUTION_EINBEHALT":
        kautionEinbehalte[q] += -betrag;
        break;
      case "SONDERZAHLUNG":
        sonderzahlungen[q] += betrag;
        break;
      default:
        if (betrag >= 0) sonstigeEinnahmen[q] += betrag;
        else sonstigeAusgaben[q] += -betrag;
    }
  }

  const kostenNachArt = new Map<string, { werte: Quartalswerte; umlagefaehig: boolean }>();
  const kostenGesamt = leer();
  let ohneDatumAnzahl = 0;
  let ohneDatumSumme = 0;
  for (const k of kostenpositionen) {
    const betrag = Number(k.betrag);
    if (!k.datum) {
      ohneDatumAnzahl++;
      ohneDatumSumme += betrag;
      continue;
    }
    const q = quartalVon(k.datum);
    const name = k.kostenart?.name ?? "Unbekannt";
    const eintrag = kostenNachArt.get(name) ?? { werte: leer(), umlagefaehig: k.kostenart?.umlagefaehig ?? false };
    eintrag.werte[q] += betrag;
    kostenNachArt.set(name, eintrag);
    kostenGesamt[q] += betrag;
  }
  const kosten = [...kostenNachArt.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => summe(b.werte) - summe(a.werte));

  const einnahmen = QUARTALE.map(
    (q) => mieteinnahmen[q] + nachzahlungen[q] + kautionEinbehalte[q] + sonderzahlungen[q] + sonstigeEinnahmen[q],
  ) as Quartalswerte;
  const ausgaben = QUARTALE.map((q) => kostenGesamt[q] + guthaben[q] + sonstigeAusgaben[q]) as Quartalswerte;
  const ergebnis = QUARTALE.map((q) => einnahmen[q] - ausgaben[q]) as Quartalswerte;

  return {
    mieteinnahmen,
    nachzahlungen,
    kautionEinbehalte,
    sonderzahlungen,
    sonstigeEinnahmen,
    einnahmen,
    kosten,
    guthaben,
    sonstigeAusgaben,
    ausgaben,
    ergebnis,
    ohneDatumAnzahl,
    ohneDatumSumme,
  };
}

// Kontostand jeweils zum Quartalsende laut Buchungsjournal (Anker aus den Objekt-Einstellungen).
async function ladeKontostaende(jahr: number) {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });
  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) return null;
  const anker = { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) };
  const eintraege = await ladeKontostandEintraege();
  const anfang = kontostandAmStichtag(eintraege, anker, new Date(jahr - 1, 11, 31, 23, 59, 59, 999));
  const ende = QUARTALE.map((q) => kontostandAmStichtag(eintraege, anker, new Date(jahr, q * 3 + 3, 0, 23, 59, 59, 999))) as Quartalswerte;
  return { anfang, ende };
}

function Zeile({
  label,
  werte,
  fett,
  farbe,
  hinweis,
}: {
  label: React.ReactNode;
  werte: Quartalswerte;
  fett?: boolean;
  farbe?: boolean;
  hinweis?: boolean;
}) {
  const cls = (v: number) =>
    `px-4 py-2 text-right ${fett ? "font-medium" : ""} ${
      hinweis ? "text-neutral-400" : farbe && v < 0 ? "text-red-400" : "text-white"
    }`;
  return (
    <tr className="border-b border-neutral-800">
      <td className={`px-4 py-2 ${fett ? "font-medium" : ""} ${hinweis ? "text-neutral-400" : "text-white"}`}>{label}</td>
      {QUARTALE.map((q) => (
        <td key={q} className={cls(werte[q])}>
          {formatEuro(werte[q])}
        </td>
      ))}
      <td className={cls(summe(werte))}>{formatEuro(summe(werte))}</td>
    </tr>
  );
}

export default async function QuartalsuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const [d, konto] = await Promise.all([ladeQuartale(jahr), ladeKontostaende(jahr)]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Quartalsübersicht</h1>
        <p className="text-sm text-neutral-400">
          Einnahmen und Ausgaben je Quartal nach dem Zuflussprinzip — zum Abgleich mit den
          Quartalsberichten des früheren Verwalters. Einnahmen nach tatsächlichem Zahlungsdatum,
          Kosten nach Buchungsdatum innerhalb des erfassten Kostenjahrs. Gesamtjahr siehe{" "}
          <Link href="/jahresuebersicht" className="underline hover:text-white">
            Jahresübersicht
          </Link>
          .
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <JahrFilterForm jahr={jahr} />
      </div>

      <div className="mb-6 overflow-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
              <th className="px-4 py-2">Position</th>
              {QUARTALE.map((q) => (
                <th key={q} className="px-4 py-2 text-right">
                  Q{q + 1} {jahr}
                </th>
              ))}
              <th className="px-4 py-2 text-right">Summe {jahr}</th>
            </tr>
          </thead>
          <tbody>
            <Zeile
              label={
                <Link href="/zahlungen" className="hover:underline">
                  Mieteinnahmen (Zahlungen)
                </Link>
              }
              werte={d.mieteinnahmen}
            />
            {summe(d.nachzahlungen) !== 0 && (
              <Zeile label="Nebenkosten-Nachzahlungen eingezogen" werte={d.nachzahlungen} />
            )}
            {summe(d.kautionEinbehalte) !== 0 && (
              <Zeile label="Kaution-Einbehalte" werte={d.kautionEinbehalte} />
            )}
            {summe(d.sonderzahlungen) !== 0 && (
              <Zeile label="Gebühren-Zahlungen von Mietern (Sonderforderungen)" werte={d.sonderzahlungen} />
            )}
            {summe(d.sonstigeEinnahmen) !== 0 && (
              <Zeile label="Sonstige Einnahmen" werte={d.sonstigeEinnahmen} />
            )}
            <Zeile label="Summe Einnahmen" werte={d.einnahmen} fett />

            <tr className="border-b border-neutral-800">
              <td colSpan={6} className="px-4 pb-1 pt-4 text-xs uppercase tracking-wide text-neutral-500">
                Ausgaben nach Kostenart
              </td>
            </tr>
            {d.kosten.map((k) => (
              <Zeile
                key={k.name}
                label={
                  <>
                    {k.name}
                    {!k.umlagefaehig && <span className="ml-2 text-xs text-neutral-500">(nicht umlagefähig)</span>}
                  </>
                }
                werte={k.werte}
              />
            ))}
            {summe(d.guthaben) !== 0 && (
              <Zeile label="Nebenkosten-Guthaben ausgezahlt" werte={d.guthaben} />
            )}
            {summe(d.sonstigeAusgaben) !== 0 && <Zeile label="Sonstige Ausgaben" werte={d.sonstigeAusgaben} />}
            <Zeile label="Summe Ausgaben" werte={d.ausgaben} fett />

            <Zeile label="Ergebnis" werte={d.ergebnis} fett farbe />

            {konto && (
              <>
                <tr className="border-b border-neutral-800">
                  <td colSpan={6} className="px-4 pb-1 pt-4 text-xs uppercase tracking-wide text-neutral-500">
                    Kontostand laut Buchungsjournal
                  </td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="px-4 py-2 text-neutral-400">Kontostand Quartalsende</td>
                  {konto.ende.map((v, q) => (
                    <td key={q} className="px-4 py-2 text-right text-white">
                      {formatEuro(v)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right text-white">{formatEuro(konto.ende[3])}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-neutral-400">Kontostand 1.1.{jahr}</td>
                  <td className="px-4 py-2 text-right text-neutral-400" colSpan={5}>
                    {formatEuro(konto.anfang)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {d.ohneDatumAnzahl > 0 && (
        <p className="mb-6 rounded-lg border border-yellow-900 p-4 text-sm text-yellow-400">
          {d.ohneDatumAnzahl} Kostenposition(en) mit {formatEuro(d.ohneDatumSumme)} für {jahr} haben kein
          Buchungsdatum und sind in keinem Quartal enthalten (in der Jahresübersicht aber schon).
        </p>
      )}
      {konto === null && (
        <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
          Kein Kontostand-Anker hinterlegt —{" "}
          <Link href="/objekt" className="underline hover:text-white">
            unter Objekt-Einstellungen
          </Link>{" "}
          eintragen, um den Kontostand je Quartal anzuzeigen.
        </p>
      )}
    </div>
  );
}
