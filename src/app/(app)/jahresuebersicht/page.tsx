import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JahrFilterForm } from "./jahr-filter-form";
import { VerifikationsStern } from "./verifikations-stern";
import { berechneMieterJahresbericht, type MietvertragFuerJahresbericht } from "@/lib/jahresbericht-mieter";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { BemerkungFeld } from "./bemerkung-feld";
import { KontenabgleichVerifikationForm } from "./kontenabgleich-verifikation-form";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function ladeJahresuebersicht(jahr: number) {
  const jahresanfang = new Date(jahr, 0, 1);
  const jahresende = new Date(jahr + 1, 0, 1);

  const [datumsBasiert, kostenpositionen] = await Promise.all([
    // Alle eur-relevanten Buchungen mit echtem Buchungsdatum im Jahr — außer Kostenpositionen,
    // die stattdessen nach Abrechnungsjahr zählen, nicht nach Buchungsdatum (siehe unten). Die
    // Auswahl läuft über das eurRelevant-Flag im Buchungsart-Katalog statt einer von Hand
    // gepflegten Code-Liste — eine künftige eur-relevante, datumsbasierte Buchungsart landet damit
    // automatisch hier, ohne dass diese Datei angefasst werden muss.
    prisma.buchung.findMany({
      where: {
        buchungsart: { eurRelevant: true, code: { not: "KOSTENPOSITION" } },
        datum: { gte: jahresanfang, lt: jahresende },
        ...AKTIVE_BUCHUNG_FILTER,
      },
      select: { betrag: true, buchungsart: { select: { code: true } } },
    }),
    prisma.buchung.findMany({
      where: { buchungsart: { eurRelevant: true, code: "KOSTENPOSITION" }, jahr, ...AKTIVE_BUCHUNG_FILTER },
      include: { kostenart: true },
    }),
  ]);

  let mieteinnahmen = 0;
  // Vorzeichen wie NebenkostenabrechnungPosition.saldo: positiv = ausgezahltes Guthaben (Ausgabe
  // für den Eigentümer), negativ = eingezogene Nachzahlung (Einnahme).
  let nachzahlungenEingezogen = 0;
  let guthabenAusgezahlt = 0;
  // Negativer Rohbetrag (siehe synchronisiereKautionEinbehaltBuchung in kautionen/actions.ts) =
  // einbehaltener, erfolgswirksamer Betrag — kein Kontofluss, aber eur-relevant wie eine
  // Betriebskosten-Erstattung (siehe Artefakt-Vergleich).
  let kautionEinbehalte = 0;
  // Fängt jede eur-relevante, datumsbasierte Buchungsart auf, die oben nicht explizit einer der
  // drei bekannten Kategorien zugeordnet wird — nur zur Absicherung der Summen, keine eigene
  // Anzeige-Zeile.
  let sonstigeEurRelevant = 0;
  let sonderzahlungen = 0;
  for (const b of datumsBasiert) {
    const betrag = Number(b.betrag);
    switch (b.buchungsart.code) {
      case "MIETZAHLUNG":
        mieteinnahmen += betrag;
        break;
      case "NEBENKOSTENAUSGLEICH": {
        const saldoBetrag = -betrag;
        if (saldoBetrag > 0) guthabenAusgezahlt += saldoBetrag;
        else nachzahlungenEingezogen += -saldoBetrag;
        break;
      }
      case "KAUTION_EINBEHALT":
        kautionEinbehalte += -betrag;
        break;
      case "SONDERZAHLUNG":
        sonderzahlungen += betrag;
        break;
      default:
        sonstigeEurRelevant += betrag;
    }
  }

  const kostenNachArtMap = new Map<string, { summe: number; umlagefaehig: boolean }>();
  for (const k of kostenpositionen) {
    const name = k.kostenart?.name ?? "Unbekannt";
    const eintrag = kostenNachArtMap.get(name) ?? {
      summe: 0,
      umlagefaehig: k.kostenart?.umlagefaehig ?? false,
    };
    eintrag.summe += Number(k.betrag);
    kostenNachArtMap.set(name, eintrag);
  }
  const kostenNachArt = [...kostenNachArtMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.summe - a.summe);
  const kostenSumme = kostenpositionen.reduce((sum, k) => sum + Number(k.betrag), 0);

  const einnahmen = mieteinnahmen + nachzahlungenEingezogen + kautionEinbehalte + sonderzahlungen + Math.max(sonstigeEurRelevant, 0);
  const ausgaben = kostenSumme + guthabenAusgezahlt + Math.max(-sonstigeEurRelevant, 0);
  const ergebnis = einnahmen - ausgaben;

  return {
    mieteinnahmen,
    kostenNachArt,
    kostenSumme,
    nachzahlungenEingezogen,
    guthabenAusgezahlt,
    kautionEinbehalte,
    sonderzahlungen,
    einnahmen,
    ausgaben,
    ergebnis,
  };
}

// Kontenabgleich (Artefakt-Vergleich, Abschnitt 7): Kontostand-Anfang + Summe aller
// zahlungswirksamen Bewegungen im Jahr, aufgeteilt nach eur_relevant, muss exakt den unabhängig
// über den vollen Kontostand-Verlauf berechneten Kontostand-Endsaldo ergeben — weicht die
// Differenz von 0 ab, fehlt eine Buchung oder eine Buchungsart ist falsch geflaggt. Der Vergleich
// gegen den tatsächlichen Kontostand laut Bankauszug bleibt Handarbeit (kein Bank-Feed
// angebunden) — die Kontrollrechnung selbst ist aber vollautomatisch.
async function ladeKontenabgleich(jahr: number) {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });
  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) return null;

  const anker = { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) };
  const eintraege = await ladeKontostandEintraege();

  const jahresanfang = new Date(jahr, 0, 1);
  const jahresende = new Date(jahr, 11, 31, 23, 59, 59, 999);
  const vorjahresende = new Date(jahresanfang.getTime() - 1);

  const kontostandAnfang = kontostandAmStichtag(eintraege, anker, vorjahresende);
  const kontostandEndeVerlauf = kontostandAmStichtag(eintraege, anker, jahresende);

  // Bewusst eine eigene, direkte Abfrage auf buchungsart.eurRelevant statt die
  // Anzeige-Kategorisierung aus ladeKontostandEintraege (zahlung/kosten/mietweiterleitung/
  // kaution/sonstige) als Stellvertreter zu nutzen — genau das Flag-statt-Code-Prinzip, um das es
  // hier geht (siehe Artefakt-Vergleich).
  const zahlungswirksameBuchungenImJahr = await prisma.buchung.findMany({
    where: {
      buchungsart: { zahlungswirksam: true },
      datum: { gte: jahresanfang, lte: jahresende },
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { betrag: true, buchungsart: { select: { code: true, eurRelevant: true } } },
  });
  let eurRelevanteBewegung = 0;
  let durchlaufendeBewegung = 0;
  for (const b of zahlungswirksameBuchungenImJahr) {
    const rohBetrag = Number(b.betrag);
    // Kostenpositionen sind im Kontostand-Verlauf vorzeichengedreht (positiv = echte Ausgabe wird
    // dort zu negativ = abgehend) — dieselbe Drehung wie in ladeKontostandEintraege, damit beide
    // Summen dieselbe Vorzeichenkonvention wie kontostandEndeVerlauf verwenden.
    const betrag = b.buchungsart.code === "KOSTENPOSITION" ? -rohBetrag : rohBetrag;
    if (b.buchungsart.eurRelevant) eurRelevanteBewegung += betrag;
    else durchlaufendeBewegung += betrag;
  }

  // Geparkte, nicht kategorisierte Buchungen bewegen den Kontostand mit (siehe
  // ladeKontostandEintraege), gehören aber weder zum Ergebnis noch zu den durchlaufenden Posten.
  const nichtKategorisiertImJahr = await prisma.nichtZugeordneteBuchung.aggregate({
    where: { datum: { gte: jahresanfang, lte: jahresende } },
    _sum: { betrag: true },
  });
  const nichtKategorisierteBewegung = Number(nichtKategorisiertImJahr._sum.betrag ?? 0);

  const kontostandEndeBerechnet =
    kontostandAnfang + eurRelevanteBewegung + durchlaufendeBewegung + nichtKategorisierteBewegung;
  const differenz = Math.round((kontostandEndeBerechnet - kontostandEndeVerlauf) * 100) / 100;

  return {
    kontostandAnfang,
    eurRelevanteBewegung,
    durchlaufendeBewegung,
    nichtKategorisierteBewegung,
    kontostandEndeBerechnet,
    kontostandEndeVerlauf,
    differenz,
  };
}

async function ladeMieterZeilen(jahr: number) {
  const [objekt, vertraegeRaw] = await Promise.all([
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: {
        einheit: true,
        mieter: true,
        abrechnungspositionen: {
          select: { saldo: true, abrechnung: { select: { jahr: true } } },
        },
        mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
      },
    }),
  ]);

  const mietvertragIds = vertraegeRaw.map((v) => v.id);
  const [zahlungenRaw, nebenkostenausgleichZahlungen, sonderRaw] = await Promise.all([
    prisma.buchung.findMany({
      where: { mietvertragId: { in: mietvertragIds }, buchungsart: { code: "MIETZAHLUNG" } },
      select: { mietvertragId: true, periodeMonat: true, periodeJahr: true, betrag: true },
    }),
    // Tatsächlich gezahlte/erhaltene Summe je Mietvertrag+Abrechnungsjahr aus dem
    // Nebenkostenausgleich-Journal (dieselbe Quelle wie die "Rückzahlung/Gutschrift"-Spalte auf
    // der Abrechnungs-Detailseite) — ersetzt das frühere, direkt auf der Position gepflegte
    // beglichenBetrag.
    prisma.buchung.findMany({
      where: { mietvertragId: { in: mietvertragIds }, buchungsart: { code: "NEBENKOSTENAUSGLEICH" } },
      select: { mietvertragId: true, jahr: true, betrag: true },
    }),
    prisma.buchung.findMany({
      where: {
        mietvertragId: { in: mietvertragIds },
        buchungsart: { code: { in: ["MAHNGEBUEHR", "SONDERZAHLUNG"] } },
        ...AKTIVE_BUCHUNG_FILTER,
      },
      select: { mietvertragId: true, datum: true, betrag: true, buchungsart: { select: { code: true } } },
    }),
  ]);
  const sonderNachVertrag = new Map<string, { datum: Date; betrag: number }[]>();
  for (const s of sonderRaw) {
    if (!s.mietvertragId || !s.datum) continue;
    const liste = sonderNachVertrag.get(s.mietvertragId) ?? [];
    liste.push({ datum: s.datum, betrag: s.buchungsart.code === "MAHNGEBUEHR" ? -Number(s.betrag) : Number(s.betrag) });
    sonderNachVertrag.set(s.mietvertragId, liste);
  }

  const zahlungenNachVertrag = new Map<string, { periodeMonat: number; periodeJahr: number; betrag: number }[]>();
  for (const z of zahlungenRaw) {
    if (!z.mietvertragId || z.periodeMonat === null || z.periodeJahr === null) continue;
    const liste = zahlungenNachVertrag.get(z.mietvertragId) ?? [];
    liste.push({ periodeMonat: z.periodeMonat, periodeJahr: z.periodeJahr, betrag: Number(z.betrag) });
    zahlungenNachVertrag.set(z.mietvertragId, liste);
  }

  const zahlungSummenMap = new Map<string, number>();
  for (const z of nebenkostenausgleichZahlungen) {
    if (!z.mietvertragId || z.jahr === null) continue;
    const key = `${z.mietvertragId}|${z.jahr}`;
    zahlungSummenMap.set(key, (zahlungSummenMap.get(key) ?? 0) - Number(z.betrag));
  }

  const vertraege: MietvertragFuerJahresbericht[] = vertraegeRaw.map((v) => ({
    id: v.id,
    beginn: v.beginn,
    ende: v.ende,
    kaltmiete: Number(v.kaltmiete),
    nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
    mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
    saldovortrag: Number(v.saldovortrag),
    mieterhoehungen: v.mieterhoehungen.map((m) => ({
      gueltigAb: m.gueltigAb,
      kaltmiete: Number(m.kaltmiete),
      nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    })),
    einheitBezeichnung: v.einheit.bezeichnung,
    mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    zahlungen: zahlungenNachVertrag.get(v.id) ?? [],
    sonderbewegungen: sonderNachVertrag.get(v.id) ?? [],
    nebenkostenPositionen: v.abrechnungspositionen.map((p) => ({
      jahr: p.abrechnung.jahr,
      saldo: Number(p.saldo),
      zahlungSumme: zahlungSummenMap.get(`${v.id}|${p.abrechnung.jahr}`) ?? 0,
    })),
  }));

  return berechneMieterJahresbericht(
    vertraege,
    jahr,
    objekt?.buchhaltungAb ?? null,
    objekt?.buchhaltungBis ?? null,
  );
}

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const [daten, mieterZeilen, verifikationen, bemerkungen, kontenabgleich, kontenabgleichVerifikation] = await Promise.all([
    ladeJahresuebersicht(jahr),
    ladeMieterZeilen(jahr),
    prisma.jahresberichtVerifikation.findMany({ where: { jahr }, select: { mietvertragId: true } }),
    prisma.jahresberichtBemerkung.findMany({ where: { jahr }, select: { mietvertragId: true, text: true } }),
    ladeKontenabgleich(jahr),
    prisma.kontenabgleichVerifikation.findUnique({ where: { jahr }, select: { kontostandLautBankauszug: true } }),
  ]);
  const verifizierteIds = new Set(verifikationen.map((v) => v.mietvertragId));
  const bemerkungNachVertrag = new Map(bemerkungen.map((b) => [b.mietvertragId, b.text]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Jahresübersicht</h1>
        <p className="text-sm text-neutral-400">
          Mieteinnahmen ./. Ausgaben nach dem Zuflussprinzip (Anlage V) — Einnahmen nach
          tatsächlichem Zahlungseingang, Kosten nach dem erfassten Abrechnungsjahr.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <JahrFilterForm jahr={jahr} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Einnahmen {jahr}</p>
          <p className="mt-1 text-xl font-semibold text-green-400">{formatEuro(daten.einnahmen)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ausgaben {jahr}</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{formatEuro(daten.ausgaben)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ergebnis {jahr}</p>
          <p
            className={`mt-1 text-xl font-semibold ${daten.ergebnis < 0 ? "text-red-400" : "text-white"}`}
          >
            {formatEuro(daten.ergebnis)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-3 text-lg font-medium text-white">Einnahmen</h2>
          <div className="rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    <Link href="/zahlungen" className="hover:underline">
                      Mieteinnahmen (Zahlungen)
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(daten.mieteinnahmen)}
                  </td>
                </tr>
                {daten.nachzahlungenEingezogen > 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href="/nebenkostenabrechnungen" className="hover:underline">
                        Nebenkosten-Nachzahlungen eingezogen
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.nachzahlungenEingezogen)}
                    </td>
                  </tr>
                )}
                {daten.kautionEinbehalte > 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href="/kautionen" className="hover:underline">
                        Kaution-Einbehalte (unstrittig/bestätigt)
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.kautionEinbehalte)}
                    </td>
                  </tr>
                )}
                {daten.sonderzahlungen !== 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">Gebühren-Zahlungen von Mietern (Sonderforderungen)</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.sonderzahlungen)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 font-medium text-white">Summe</td>
                  <td className="px-4 py-2 text-right font-medium text-white">
                    {formatEuro(daten.einnahmen)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium text-white">Ausgaben nach Kostenart</h2>
          <div className="max-h-[400px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {daten.kostenNachArt.map((k) => (
                  <tr key={k.name} className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      {k.name}
                      {!k.umlagefaehig && (
                        <span className="ml-2 text-xs text-neutral-500">(nicht umlagefähig)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-white">{formatEuro(k.summe)}</td>
                  </tr>
                ))}
                {daten.kostenNachArt.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-neutral-500">
                      Keine Kostenpositionen für {jahr}.
                    </td>
                  </tr>
                )}
                {daten.guthabenAusgezahlt > 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href="/nebenkostenabrechnungen" className="hover:underline">
                        Nebenkosten-Guthaben ausgezahlt
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.guthabenAusgezahlt)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 font-medium text-white">Summe</td>
                  <td className="px-4 py-2 text-right font-medium text-white">
                    {formatEuro(daten.ausgaben)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-medium text-white">Kontenabgleich {jahr}</h2>
        {kontenabgleich === null ? (
          <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
            Kein Kontostand-Anker hinterlegt —{" "}
            <Link href="/objekt" className="underline hover:text-white">
              unter Objekt-Einstellungen
            </Link>{" "}
            eintragen, um den Kontenabgleich zu berechnen.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-400">
              Kontrollrechnung: Kontostand am 31.12. laut Buchungsjournal (Kontostand Anfang + alle
              zahlungswirksamen Bewegungen im Jahr) muss exakt dem unabhängig über den vollen
              Kontostand-Verlauf berechneten Endsaldo entsprechen — weicht die Differenz von 0 ab,
              fehlt eine Buchung oder eine Buchungsart ist falsch geflaggt (zahlungswirksam/
              eurRelevant). Der Abgleich gegen den tatsächlichen Kontostand laut Kontoauszug bleibt
              manuell, siehe{" "}
              <Link href="/kontostand" className="underline hover:text-white">
                Kontostand
              </Link>
              .
            </p>
            <div className="overflow-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">Kontostand am 1.1.{jahr}</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.kontostandAnfang)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">+ eur-relevante Bewegung (Ergebnis)</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.eurRelevanteBewegung)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">+ durchlaufende Posten (Kaution/Mietweiterleitung)</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.durchlaufendeBewegung)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">+ nicht kategorisierte Buchungen</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.nichtKategorisierteBewegung)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800 font-medium">
                    <td className="px-4 py-2 text-white">= Kontostand am 31.12.{jahr} (berechnet)</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.kontostandEndeBerechnet)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-neutral-400">
                      Kontostand am 31.12.{jahr} (Kontostand-Verlauf, unabhängig berechnet)
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-400">
                      {formatEuro(kontenabgleich.kontostandEndeVerlauf)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-medium text-white">Differenz</td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${kontenabgleich.differenz === 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {formatEuro(kontenabgleich.differenz)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <KontenabgleichVerifikationForm
              jahr={jahr}
              kontostandLautJournal={kontenabgleich.kontostandEndeVerlauf}
              gespeicherterWert={
                kontenabgleichVerifikation ? Number(kontenabgleichVerifikation.kontostandLautBankauszug) : null
              }
            />
          </>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-medium text-white">Mieteinnahmen nach Mietvertrag</h2>
        <p className="mb-3 text-sm text-neutral-400">
          Saldo neu = Saldo alt − Soll + Miete (+ Gebühren/Sonderforderungen) + Nebenkostenabrechnung offen (Vorjahr), wobei Soll =
          Soll Kaltmiete + Soll Nebenkosten (letztere Spalte zeigt bei Garagen die Mehrwertsteuer
          statt Nebenkosten). Negativer Saldo = Rückstand, positiver Saldo = Guthaben/
          Vorauszahlung. &bdquo;Nebenkostenabrechnung
          offen (Vorjahr)&ldquo; zeigt den offenen Saldo der {jahr - 1}er-Abrechnung (eine
          Nebenkostenabrechnung wird typischerweise erst im Folgejahr beglichen, fließt daher erst
          in Saldo neu ein, nicht in Saldo alt): positiv = noch auszuzahlendes Guthaben, negativ =
          noch einzuziehende Nachzahlung. Im Mieterkonto des Mietvertrags steht Saldo neu als
          &bdquo;Saldo inkl. offener Nebenkostenabrechnung&ldquo;.
        </p>
        <p className="mb-3 text-sm text-neutral-400">
          Miete sowie Saldo alt/neu zählen nach der{" "}
          <Link href="/zahlungen" className="underline hover:text-white">
            zugeordneten Periode
          </Link>{" "}
          einer Zahlung, nicht nach ihrem tatsächlichen Buchungsdatum — eine z.B. Ende Dezember
          schon für Januar überwiesene Miete zählt so korrekt zum Folgejahr, statt das laufende
          Jahr künstlich ins Plus zu ziehen.
        </p>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                <th className="px-4 py-2">Mietvertrag</th>
                <th className="px-4 py-2 text-right" title="Monatliche Kaltmiete, wie sie im letzten Berichtsmonat gilt">
                  Kaltmiete mtl.
                </th>
                <th className="px-4 py-2 text-right" title="Monatliche NK-Vorauszahlung (bei Garagen die Mehrwertsteuer), letzter Berichtsmonat">
                  NK mtl.
                </th>
                <th className="px-4 py-2 text-right">Miete warm mtl.</th>
                <th className="px-4 py-2 text-right">Saldo alt</th>
                <th className="px-4 py-2 text-right">Soll Kaltmiete</th>
                <th className="px-4 py-2 text-right">Soll Nebenkosten</th>
                <th className="px-4 py-2 text-right">Soll gesamt</th>
                <th className="px-4 py-2 text-right">Miete</th>
                <th className="px-4 py-2 text-right">Nebenkostenabrechnung offen (Vorjahr)</th>
                <th className="px-4 py-2 text-right">Saldo neu</th>
                <th className="px-4 py-2">Bemerkung</th>
                <th className="px-4 py-2 text-center" title="Stimmt mit dem vorhandenen Jahresbericht des früheren Verwalters überein">
                  ✓
                </th>
              </tr>
            </thead>
            <tbody>
              {mieterZeilen.map((z) => (
                <tr key={z.mietvertragId} className="border-b border-neutral-800">
                  <td className="px-4 py-2">
                    <Link href={`/mietvertraege/${z.mietvertragId}`} className="text-white hover:underline">
                      {z.einheitBezeichnung} – {z.mieterNamen}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-400">{formatEuro(z.kaltmieteMtl)}</td>
                  <td className="px-4 py-2 text-right text-neutral-400">{formatEuro(z.nebenkostenMtl)}</td>
                  <td className="px-4 py-2 text-right text-neutral-400">{formatEuro(z.warmMtl)}</td>
                  <td className={`px-4 py-2 text-right ${z.saldoAlt < 0 ? "text-red-400" : "text-neutral-300"}`}>
                    {formatEuro(z.saldoAlt)}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-300">{formatEuro(z.sollKaltmiete)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{formatEuro(z.sollNebenkosten)}</td>
                  <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(z.soll)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{formatEuro(z.miete)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">
                    {z.nebenkostenabrechnungOffen ? formatEuro(z.nebenkostenabrechnungOffen) : "–"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${z.saldoNeu < 0 ? "text-red-400" : "text-white"}`}
                  >
                    {formatEuro(z.saldoNeu)}
                  </td>
                  <td className="px-2 py-1">
                    <BemerkungFeld
                      key={`${z.mietvertragId}-${jahr}-${bemerkungNachVertrag.get(z.mietvertragId) ?? ""}`}
                      mietvertragId={z.mietvertragId}
                      jahr={jahr}
                      initial={bemerkungNachVertrag.get(z.mietvertragId) ?? ""}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <VerifikationsStern
                      mietvertragId={z.mietvertragId}
                      jahr={jahr}
                      verifiziert={verifizierteIds.has(z.mietvertragId)}
                    />
                  </td>
                </tr>
              ))}
              {mieterZeilen.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-4 text-center text-neutral-500">
                    Keine Mietverträge mit Bewegung in {jahr}.
                  </td>
                </tr>
              )}
            </tbody>
            {mieterZeilen.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-800 font-medium">
                  <td className="px-4 py-2 text-white">Summe</td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.kaltmieteMtl, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.nebenkostenMtl, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.warmMtl, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.saldoAlt, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.sollKaltmiete, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.sollNebenkosten, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.soll, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.miete, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + (z.nebenkostenabrechnungOffen ?? 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.saldoNeu, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
