import Link from "next/link";
import { SONDERBUCHUNGEN_FILTER, sonderWirkung } from "@/lib/sonderforderungen";
import { NK_AUSGLEICH_ODER_VERRECHNUNG, nkBegleichung } from "@/lib/nk-verrechnung";
import { prisma } from "@/lib/prisma";
import { JahrFilterForm } from "./jahr-filter-form";
import { MieterTabelle } from "./mieter-tabelle";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { berechneMieterBericht, type MietvertragFuerJahresbericht } from "@/lib/jahresbericht-mieter";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { KontenabgleichVerifikationForm } from "./kontenabgleich-verifikation-form";
import { mieterName } from "@/lib/mieter-name";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// Berichtszeitraum: das ganze Jahr (quartal = 0, Jahresübersicht) oder ein Quartal (1–4,
// Quartalsübersicht). `bis` ist der letzte Moment des Zeitraums, `bisExklusiv` der Beginn des
// Folgezeitraums.
export type Zeitraum = {
  jahr: number;
  quartal: number;
  von: Date;
  bis: Date;
  bisExklusiv: Date;
  // Q1/Q2: offene Nebenkostenabrechnung des Vorjahres bleibt außen vor (Abrechnung meist erst in Q3).
  mitNkOffen: boolean;
  label: string;
  anfangText: string;
  endeText: string;
};

export function bildeZeitraum(jahr: number, quartal: number): Zeitraum {
  const ersterMonat = quartal === 0 ? 0 : (quartal - 1) * 3;
  const anzahlMonate = quartal === 0 ? 12 : 3;
  const von = new Date(jahr, ersterMonat, 1);
  const bisExklusiv = new Date(jahr, ersterMonat + anzahlMonate, 1);
  const bis = new Date(bisExklusiv.getTime() - 1);
  const letzterTag = new Date(bis.getFullYear(), bis.getMonth() + 1, 0).getDate();
  return {
    jahr,
    quartal,
    von,
    bis,
    bisExklusiv,
    mitNkOffen: quartal === 0 || quartal >= 3,
    label: quartal === 0 ? `${jahr}` : `Q${quartal} ${jahr}`,
    anfangText: `1.${ersterMonat + 1}.${jahr}`,
    endeText: `${letzterTag}.${ersterMonat + anzahlMonate}.${jahr}`,
  };
}

async function ladeJahresuebersicht(zeitraum: Zeitraum) {
  const { jahr, quartal } = zeitraum;
  const jahresanfang = zeitraum.von;
  const jahresende = zeitraum.bisExklusiv;

  const [datumsBasiert, kostenpositionen] = await Promise.all([
    // Alle eur-relevanten Buchungen mit echtem Buchungsdatum im Jahr — außer Kostenpositionen,
    // die wegen des Fallbacks ohne Datum eine eigene Abfrage haben (siehe unten). Die
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
      where: {
        buchungsart: { eurRelevant: true, code: "KOSTENPOSITION" },
        // Abflussprinzip: es zählt das Abbuchungsdatum, nicht das Kostenjahr (`jahr` gilt nur für
        // die Nebenkostenabrechnung) — z.B. ein Abfallbescheid 2024, abgebucht am 2.1.2025, zählt
        // für 2025. Die 10-Tage-Regel (§ 11 Abs. 2 Satz 2 EStG) ist bewusst nicht umgesetzt.
        // Positionen ohne Datum fallen aufs Kostenjahr zurück und sind keinem Quartal zuordenbar.
        OR: [
          { datum: { gte: jahresanfang, lt: jahresende } },
          ...(quartal === 0 ? [{ datum: null, jahr }] : []),
        ],
        ...AKTIVE_BUCHUNG_FILTER,
      },
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
async function ladeKontenabgleich(zeitraum: Zeitraum) {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });
  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) return null;

  const anker = { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) };
  const eintraege = await ladeKontostandEintraege();

  const jahresanfang = zeitraum.von;
  const jahresende = zeitraum.bis;
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

async function ladeMieterZeilen(zeitraum: Zeitraum) {
  const [objekt, vertraegeRaw] = await Promise.all([
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: {
        einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
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
      where: { mietvertragId: { in: mietvertragIds }, ...NK_AUSGLEICH_ODER_VERRECHNUNG, ...AKTIVE_BUCHUNG_FILTER },
      select: { mietvertragId: true, jahr: true, betrag: true, buchungsart: { select: { code: true } } },
    }),
    prisma.buchung.findMany({
      where: {
        mietvertragId: { in: mietvertragIds },
        ...SONDERBUCHUNGEN_FILTER,
        ...AKTIVE_BUCHUNG_FILTER,
      },
      select: { mietvertragId: true, datum: true, betrag: true, buchungsart: { select: { code: true } } },
    }),
  ]);
  const sonderNachVertrag = new Map<string, { datum: Date; betrag: number }[]>();
  for (const s of sonderRaw) {
    if (!s.mietvertragId || !s.datum) continue;
    const liste = sonderNachVertrag.get(s.mietvertragId) ?? [];
    liste.push({ datum: s.datum, betrag: sonderWirkung(s.buchungsart.code, Number(s.betrag)) });
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
    zahlungSummenMap.set(key, (zahlungSummenMap.get(key) ?? 0) + nkBegleichung(z.buchungsart.code, Number(z.betrag)));
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
    mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & "),
    zahlungen: zahlungenNachVertrag.get(v.id) ?? [],
    sonderbewegungen: sonderNachVertrag.get(v.id) ?? [],
    nebenkostenPositionen: v.abrechnungspositionen.map((p) => ({
      jahr: p.abrechnung.jahr,
      saldo: Number(p.saldo),
      zahlungSumme: zahlungSummenMap.get(`${v.id}|${p.abrechnung.jahr}`) ?? 0,
    })),
  }));

  // Rang in der Objekt-Reihenfolge der Einheiten (Haus-Reihenfolge) statt alphabetisch.
  const einheitRang = new Map(
    sortEinheitenNachGebaeude(
      vertraegeRaw.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
    ).map((v, i) => [v.id, i]),
  );

  // Mieter mit Kommentar bleiben auch bei Saldo 0 und ohne Bewegung sichtbar — der Kommentar dient
  // dem Abgleich mit dem Vorverwalter (z.B. "Fehler bei Kanthak"), sonst wäre er danach nicht mehr zu sehen.
  const mitKommentar = new Set(
    (
      await prisma.jahresberichtKommentar.findMany({
        where: { jahr: zeitraum.jahr, quartal: zeitraum.quartal },
        select: { mietvertragId: true },
      })
    ).map((k) => k.mietvertragId),
  );

  return berechneMieterBericht(
    vertraege,
    zeitraum,
    objekt?.buchhaltungAb ?? null,
    objekt?.buchhaltungBis ?? null,
    mitKommentar,
  )
    .map((z) => ({ ...z, einheitRang: einheitRang.get(z.mietvertragId) ?? 0 }))
    .sort((a, b) => a.einheitRang - b.einheitRang);
}

export async function BerichtSeite({ jahr, quartal }: { jahr: number; quartal: number }) {
  const zeitraum = bildeZeitraum(jahr, quartal);
  const { label } = zeitraum;
  const istQuartal = quartal !== 0;

  const [daten, mieterZeilen, verifikationen, kommentare, kontenabgleich, kontenabgleichVerifikation] = await Promise.all([
    ladeJahresuebersicht(zeitraum),
    ladeMieterZeilen(zeitraum),
    prisma.jahresberichtVerifikation.findMany({ where: { jahr, quartal }, select: { mietvertragId: true } }),
    prisma.jahresberichtKommentar.findMany({ where: { jahr, quartal }, select: { mietvertragId: true, kommentar: true } }),
    ladeKontenabgleich(zeitraum),
    prisma.kontenabgleichVerifikation.findUnique({
      where: { jahr_quartal: { jahr, quartal } },
      select: { kontostandLautBankauszug: true },
    }),
  ]);
  const verifizierteIds = new Set(verifikationen.map((v) => v.mietvertragId));
  const kommentarNachMietvertrag = new Map(kommentare.map((k) => [k.mietvertragId, k.kommentar]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">{istQuartal ? "Jahresübersicht – Quartal" : "Jahresübersicht"}</h1>
        <p className="text-sm text-neutral-400">
          Mieteinnahmen ./. Ausgaben nach dem Zuflussprinzip (Anlage V) — Einnahmen nach
          tatsächlichem Zahlungseingang,{" "}
          Kosten nach Abbuchungsdatum (Abflussprinzip, auch wenn sie ein anderes Kostenjahr betreffen —
          z.B. Abfallbescheid des Vorjahres im Januar; die 10-Tage-Regel ist nicht berücksichtigt).
          {istQuartal
            ? " Zum Abgleich mit den Quartalsberichten des früheren Verwalters."
            : " Kostenpositionen ohne Datum zählen im Kostenjahr."}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <JahrFilterForm jahr={jahr} quartal={quartal} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Einnahmen {label}</p>
          <p className="mt-1 text-xl font-semibold text-green-400">{formatEuro(daten.einnahmen)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ausgaben {label}</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{formatEuro(daten.ausgaben)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ergebnis {label}</p>
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
                      Keine Kostenpositionen für {label}.
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
        <h2 className="mb-3 text-lg font-medium text-white">Kontenabgleich {label}</h2>
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
              Kontrollrechnung: Kontostand am Ende des Zeitraums laut Buchungsjournal (Kontostand Anfang + alle
              zahlungswirksamen Bewegungen im Zeitraum) muss exakt dem unabhängig über den vollen
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
                    <td className="px-4 py-2 text-white">Kontostand am {zeitraum.anfangText}</td>
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
                    <td className="px-4 py-2 text-white">= Kontostand am {zeitraum.endeText} (berechnet)</td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(kontenabgleich.kontostandEndeBerechnet)}
                    </td>
                  </tr>
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-neutral-400">
                      Kontostand am {zeitraum.endeText} (Kontostand-Verlauf, unabhängig berechnet)
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
              quartal={quartal}
              stichtagText={zeitraum.endeText}
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
        {!zeitraum.mitNkOffen && (
          <p className="mb-3 text-sm text-neutral-400">
            In {label} ist die Nebenkostenabrechnung des Vorjahres noch nicht berücksichtigt (sie
            liegt meist erst im 3. Quartal vor): Saldo neu = Saldo alt − Soll + Miete
            (+ Gebühren/Sonderforderungen), ohne Spalte &bdquo;Nebenkostenabrechnung offen (Vorjahr)&ldquo;.
          </p>
        )}
        <p className="mb-3 text-sm text-neutral-400">
          Miete sowie Saldo alt/neu zählen nach der{" "}
          <Link href="/zahlungen" className="underline hover:text-white">
            zugeordneten Periode
          </Link>{" "}
          einer Zahlung, nicht nach ihrem tatsächlichen Buchungsdatum — eine z.B. Ende Dezember
          schon für Januar überwiesene Miete zählt so korrekt zum Folgejahr, statt das laufende
          Jahr künstlich ins Plus zu ziehen.
        </p>
        <p className="mb-3 text-sm text-neutral-400">
          Mieter ohne Bewegung und mit Saldo 0 werden ausgeblendet — außer sie haben einen
          Kommentar: Diese Zeilen bleiben sichtbar, damit der Kommentar zum Abgleich mit dem früheren
          Verwalter erhalten bleibt (z.B. ein dort noch offener Rückstand, der in der App längst
          beglichen ist).
        </p>
        <MieterTabelle
          zeilen={mieterZeilen.map((z) => ({
            id: z.mietvertragId,
            einheit: z.einheitBezeichnung,
            einheitRang: z.einheitRang,
            mieter: z.mieterNamen,
            kaltmieteMtl: z.kaltmieteMtl,
            nebenkostenMtl: z.nebenkostenMtl,
            warmMtl: z.warmMtl,
            saldoAlt: z.saldoAlt,
            sollKaltmiete: z.sollKaltmiete,
            sollNebenkosten: z.sollNebenkosten,
            soll: z.soll,
            miete: z.miete,
            nebenkostenabrechnungOffen: z.nebenkostenabrechnungOffen,
            saldoNeu: z.saldoNeu,
            verifiziert: verifizierteIds.has(z.mietvertragId),
            kommentar: kommentarNachMietvertrag.get(z.mietvertragId) ?? "",
          }))}
          jahr={jahr}
          quartal={quartal}
          label={label}
          mitNkOffen={zeitraum.mitNkOffen}
        />
      </div>

    </div>
  );
}
