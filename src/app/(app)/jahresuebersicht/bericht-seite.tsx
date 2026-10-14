import { mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import Link from "next/link";
import { MIETERKONTO_VERRECHNUNG_BEZUG, SONDERBUCHUNGEN_FILTER, sonderWirkung } from "@/lib/sonderforderungen";
import { NK_AUSGLEICH_ODER_VERRECHNUNG, nkBegleichung } from "@/lib/nk-verrechnung";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { JahrFilterForm } from "./jahr-filter-form";
import { MieterTabelle } from "./mieter-tabelle";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { berechneMieterBericht, type MietvertragFuerJahresbericht } from "@/lib/jahresbericht-mieter";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { KontenabgleichVerifikationForm } from "./kontenabgleich-verifikation-form";
import { mieterName } from "@/lib/mieter-name";
import { unbezahlteNkVorauszahlung } from "@/lib/nk-saldo";
import { effektiverStichtag, hatEigenenStichtag } from "@/lib/buchhaltung-stichtag";
import {
  KOSTENGRUPPE_LABEL,
  schuldzinsenHinweis,
  baueAnlageVAufstellung,
  kostengruppeFuer,
  ueberschussBezeichnung,
  type KostenSumme,
} from "@/lib/anlage-v";
import { ladeAfaPositionen } from "@/lib/afa-positionen";
import { afaEinzelposten } from "@/lib/aufstellung-export";
import { teileMietzahlungen } from "@/lib/miete-aufteilung";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
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

export async function ladeJahresuebersicht(zeitraum: Zeitraum) {
  const { jahr, quartal } = zeitraum;
  const jahresanfang = zeitraum.von;
  const jahresende = zeitraum.bisExklusiv;

  const [datumsBasiert, kostenpositionen, mietAufteilung, schuldzinsenAndereRoh] = await Promise.all([
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
      select: { betrag: true, jahr: true, bezugTyp: true, buchungsart: { select: { code: true } } },
    }),
    prisma.buchung.findMany({
      where: {
        buchungsart: { eurRelevant: true, code: "KOSTENPOSITION" },
        // Abflussprinzip: es zählt das Abbuchungsdatum, nicht das Kostenjahr (`jahr` gilt nur für
        // die Nebenkostenabrechnung) — z.B. ein Abfallbescheid 2024, abgebucht am 2.1.2025, zählt
        // für 2025. Die 10-Tage-Regel (§ 11 Abs. 2 Satz 2 EStG) ist für Kosten bewusst nicht umgesetzt.
        // Positionen ohne Datum fallen aufs Kostenjahr zurück und sind keinem Quartal zuordenbar.
        OR: [
          { datum: { gte: jahresanfang, lt: jahresende } },
          ...(quartal === 0 ? [{ datum: null, jahr }] : []),
        ],
        ...AKTIVE_BUCHUNG_FILTER,
      },
      include: { kostenart: true },
    }),
    // Aufteilung der Mietzahlungen in Kaltmiete und NK-Vorauszahlung — nur für die Aufstellung
    // Anlage V im Gesamtjahr (lädt auch frühere Zahlungen derselben Mietmonate).
    quartal === 0 ? ladeMietAufteilung(zeitraum) : Promise.resolve(null),
    // Schuldzinsen von anderen Konten (Jahreswerte laut Bankbescheinigung) — nur für die Aufstellung im Gesamtjahr.
    quartal === 0
      ? prisma.schuldzinsenJahreswert.findMany({ where: { jahr }, orderBy: [{ bezeichnung: "asc" }, { erstelltAm: "asc" }] })
      : Promise.resolve([]),
  ]);
  const schuldzinsenAndereEintraege = schuldzinsenAndereRoh.map((e) => ({
    bezeichnung: e.bezeichnung,
    betrag: Number(e.betrag),
    bemerkung: e.bemerkung,
  }));

  let mieteinnahmen = 0;
  // Vorzeichen wie NebenkostenabrechnungPosition.saldo: positiv = ausgezahltes Guthaben (Ausgabe
  // für den Eigentümer), negativ = eingezogene Nachzahlung (Einnahme).
  let nachzahlungenEingezogen = 0;
  let guthabenAusgezahlt = 0;
  // Negativer Rohbetrag (siehe synchronisiereKautionEinbehaltBuchung in kautionen/actions.ts) =
  // einbehaltener, erfolgswirksamer Betrag — kein Kontofluss, aber eur-relevant wie eine
  // Betriebskosten-Erstattung (siehe Artefakt-Vergleich).
  let kautionEinbehalte = 0;
  let kautionMitMiete = 0;
  let kautionMitNk = 0;
  let kautionPauschal = 0;
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
        // Für die Steuer-Aufstellung nach Art: Verrechnung mit Mieterkonto (Miete), mit der
        // Nebenkostenabrechnung (Abrechnungsjahr gesetzt) oder pauschaler Einbehalt.
        if (b.bezugTyp === MIETERKONTO_VERRECHNUNG_BEZUG) kautionMitMiete += -betrag;
        else if (b.jahr !== null) kautionMitNk += -betrag;
        else kautionPauschal += -betrag;
        break;
      case "SONDERZAHLUNG":
        sonderzahlungen += betrag;
        break;
      default:
        sonstigeEurRelevant += betrag;
    }
  }

  const kostenNachArtMap = new Map<string, { summe: number; umlagefaehig: boolean }>();
  const steuerKosten = new Map<string, KostenSumme>();
  const afaBuchungen: typeof kostenpositionen = [];
  for (const k of kostenpositionen) {
    const name = k.kostenart?.name ?? "Unbekannt";
    const eintrag = kostenNachArtMap.get(name) ?? {
      summe: 0,
      umlagefaehig: k.kostenart?.umlagefaehig ?? false,
    };
    eintrag.summe += Number(k.betrag);
    kostenNachArtMap.set(name, eintrag);

    // Die Einordnung als Anschaffung/Herstellung (AfA) gilt ab 2026 (AFA_AB_JAHR), davor zählen die Kosten wie bisher.
    const zuordnung = kostengruppeFuer(
      {
        name,
        umlagefaehig: k.kostenart?.umlagefaehig ?? false,
        anlageVZeile: k.kostenart?.anlageVZeile ?? null,
      },
      jahr,
    );
    if (zuordnung.gruppe === "ANSCHAFFUNG") afaBuchungen.push(k);
    const gruppenSumme = steuerKosten.get(name) ?? { name, ...zuordnung, summe: 0 };
    gruppenSumme.summe += Number(k.betrag);
    steuerKosten.set(name, gruppenSumme);
  }
  const kostenNachArt = [...kostenNachArtMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.summe - a.summe);
  const kostenSumme = kostenpositionen.reduce((sum, k) => sum + Number(k.betrag), 0);

  const einnahmen = mieteinnahmen + nachzahlungenEingezogen + kautionEinbehalte + sonderzahlungen + Math.max(sonstigeEurRelevant, 0);
  const ausgaben = kostenSumme + guthabenAusgezahlt + Math.max(-sonstigeEurRelevant, 0);
  const ergebnis = einnahmen - ausgaben;

  // Gleiches Ergebnis in der Gliederung des Steuerberaters (nur im Gesamtjahr angezeigt). Die Mieten sind
  // nach der 10-Tage-Regel dem Jahr zugeordnet; ohne Aufteilung (Quartal) bleibt alles bei der Kaltmiete.
  const steuer = baueAnlageVAufstellung({
    kaltmiete: mietAufteilung ? mietAufteilung.kaltmiete : mieteinnahmen,
    umsatzsteuer: mietAufteilung?.umsatzsteuer ?? 0,
    nkVorauszahlungen: mietAufteilung?.nebenkosten ?? 0,
    nachzahlungenEingezogen,
    guthabenAusgezahlt,
    kautionMitNk,
    kautionMitMiete,
    kautionPauschal,
    sonderzahlungen,
    sonstigeEurRelevant,
    kosten: [...steuerKosten.values()],
    schuldzinsenAndere: schuldzinsenAndereEintraege.reduce((s, e) => s + e.betrag, 0),
    abgrenzung: mietAufteilung?.abgrenzung ?? { hinzu: 0, anzahlHinzu: 0, heraus: 0, anzahlHeraus: 0 },
  });

  // Einzelposten der Anschaffungs-/Herstellungskosten (Grundlage der Abschreibung) — nur im Gesamtjahr, da
  // nur dort die Aufstellung angezeigt wird.
  const afaPositionen = quartal === 0 ? await ladeAfaPositionen(afaBuchungen) : [];

  return {
    steuer,
    schuldzinsenAndereEintraege,
    afaPositionen,
    steuerKosten: [...steuerKosten.values()].sort((a, b) => b.summe - a.summe),
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

// Teilt die im Zeitraum eingegangenen Mietzahlungen in Kaltmiete und NK-Vorauszahlung (siehe
// teileMietzahlungen). Berücksichtigt auch frühere Zahlungen derselben Mietmonate, weil sich der
// NK-Anteil nach den davor eingegangenen Zahlungen richtet.
async function ladeMietAufteilung(zeitraum: Zeitraum) {
  const { jahr } = zeitraum;
  const zahlungen = await prisma.buchung.findMany({
    where: {
      buchungsart: { code: "MIETZAHLUNG" },
      datum: { lt: zeitraum.bisExklusiv },
      OR: [
        { datum: { gte: new Date(zeitraum.von.getFullYear(), zeitraum.von.getMonth() - 2, 1) } },
        { periodeJahr: { in: [jahr - 1, jahr, jahr + 1] } },
      ],
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { mietvertragId: true, datum: true, erstelltAm: true, betrag: true, periodeJahr: true, periodeMonat: true },
  });
  const vertragIds = [...new Set(zahlungen.map((z) => z.mietvertragId).filter((id): id is string => !!id))];
  const vertraege = await prisma.mietvertrag.findMany({
    where: { id: { in: vertragIds } },
    select: {
      id: true,
      kaltmiete: true,
      nebenkostenVorauszahlung: true,
      mehrwertsteuer: true,
      mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
    },
  });
  const vertragNachId = new Map(
    vertraege.map((v) => [
      v.id,
      {
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
        mieterhoehungen: v.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
      },
    ]),
  );

  return teileMietzahlungen(
    zahlungen
      .filter((z) => z.datum !== null)
      .map((z) => ({
        mietvertragId: z.mietvertragId,
        datum: z.datum!,
        reihenfolge: z.erstelltAm.getTime(),
        betrag: Number(z.betrag),
        // Ohne Mietperiode zählt der Monat des Buchungsdatums (wie in der Nebenkostenabrechnung).
        periodeJahr: z.periodeJahr ?? z.datum!.getFullYear(),
        periodeMonat: z.periodeMonat ?? z.datum!.getMonth() + 1,
      })),
    (vertragId, j, monat) => {
      const v = vertragNachId.get(vertragId);
      if (!v) return { kaltmiete: 0, nebenkosten: 0, mehrwertsteuer: 0 };
      const miete = ermittleMieteFuerMonat(v, j, monat);
      return { kaltmiete: miete.kaltmiete, nebenkosten: miete.nebenkostenVorauszahlung, mehrwertsteuer: v.mehrwertsteuer };
    },
    jahr,
  );
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
          select: {
            id: true,
            saldo: true,
            zeitraumVon: true,
            zeitraumBis: true,
            vorauszahlungGesamt: true,
            abrechnung: { select: { jahr: true, versendetAm: true } },
          },
        },
        mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
        mietnachlaesse: { select: { jahr: true, monat: true, betrag: true } },
      },
    }),
  ]);

  const mietvertragIds = vertraegeRaw.map((v) => v.id);
  // Nur berechnete Positionen (details gesetzt) bekommen die Gegenrechnung der unbezahlten
  // NK-Vorauszahlung; manuelle haben von Hand eingetragene Beträge (siehe unbezahlteNkVorauszahlung).
  const berechnetePositionIds = new Set(
    (
      await prisma.nebenkostenabrechnungPosition.findMany({
        where: { NOT: { details: { equals: Prisma.DbNull } } },
        select: { id: true },
      })
    ).map((p) => p.id),
  );
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
    // Stichtag je Vertrag: eigener (früherer) oder der des Objekts.
    buchhaltungAb: effektiverStichtag(v, objekt),
    saldovortrag: Number(v.saldovortrag),
    mieterhoehungen: v.mieterhoehungen.map((m) => ({
      gueltigAb: m.gueltigAb,
      kaltmiete: Number(m.kaltmiete),
      nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    })),
    mietnachlaesse: mietnachlaesseFuerSoll(v.mietnachlaesse),
    einheitBezeichnung: v.einheit.bezeichnung,
    mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & "),
    zahlungen: zahlungenNachVertrag.get(v.id) ?? [],
    sonderbewegungen: sonderNachVertrag.get(v.id) ?? [],
    // Berechnete Positionen nicht versendeter Abrechnungen zählen weder als Abrechnung noch als Gutschrift.
    nebenkostenPositionen: v.abrechnungspositionen
      .filter((p) => !berechnetePositionIds.has(p.id) || p.abrechnung.versendetAm)
      .map((p) => ({
      jahr: p.abrechnung.jahr,
      versendetAm: p.abrechnung.versendetAm,
      saldo: Number(p.saldo),
      zahlungSumme: zahlungSummenMap.get(`${v.id}|${p.abrechnung.jahr}`) ?? 0,
      unbezahlteVorauszahlung: berechnetePositionIds.has(p.id)
        ? unbezahlteNkVorauszahlung(
            {
              kaltmiete: Number(v.kaltmiete),
              nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
              mieterhoehungen: v.mieterhoehungen.map((m) => ({
                gueltigAb: m.gueltigAb,
                kaltmiete: Number(m.kaltmiete),
                nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
              })),
            },
            { zeitraumVon: p.zeitraumVon, zeitraumBis: p.zeitraumBis, vorauszahlungGesamt: Number(p.vorauszahlungGesamt) },
            effektiverStichtag(v, objekt),
          )
        : 0,
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

  // Verträge mit eigenem, vom Objekt abweichendem Stichtag — in der Tabelle gekennzeichnet, weil die
  // Summenzeilen dann unterschiedliche Stichtage mischen.
  const abweichenderStichtag = new Map(
    vertraegeRaw.filter((v) => hatEigenenStichtag(v, objekt)).map((v) => [v.id, formatDatum(v.buchhaltungAb!)]),
  );

  return berechneMieterBericht(vertraege, zeitraum, objekt?.buchhaltungBis ?? null, mitKommentar)
    .map((z) => ({
      ...z,
      einheitRang: einheitRang.get(z.mietvertragId) ?? 0,
      eigenerStichtag: abweichenderStichtag.get(z.mietvertragId) ?? null,
    }))
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
          z.B. Abfallbescheid des Vorjahres im Januar; die 10-Tage-Regel gilt nur für die Mieten der Aufstellung für die Steuererklärung).
          {istQuartal
            ? " Zum Abgleich mit den Quartalsberichten des früheren Verwalters."
            : " Kostenpositionen ohne Datum zählen im Kostenjahr."}
        </p>
        {istQuartal && (
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">
            Abweichungen zum Verwalterbericht, die kein Fehler sind: Rücklastschrift-Gebühren (hier
            Kosten, beim Verwalter Abzug bei den Mietern), Waschgeld (beim Verwalter netto mit der
            Entnahme) und Mahngebühren (beim Verwalter Einnahme). Im Zweifel gilt der
            Bankverwendungszweck, nicht der Verwaltertext.
          </p>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <JahrFilterForm jahr={jahr} quartal={quartal} />
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-medium text-white">Mieteinnahmen nach Mietvertrag</h2>
        <details className="mb-3">
          <summary className="cursor-pointer text-sm text-neutral-400 hover:text-white">
            Hinweise zur Berechnung
          </summary>
          <div className="mt-3">
          <p className="mb-3 text-sm text-neutral-400">
            Saldo neu = Saldo alt − Soll + Miete (+ Gebühren/Sonderforderungen) + Nebenkostenabrechnung offen (Vorjahr), wobei Soll =
            Soll Kaltmiete + Soll Nebenkosten (letztere Spalte zeigt bei Garagen die Mehrwertsteuer
            statt Nebenkosten). Negativer Saldo = Rückstand, positiver Saldo = Guthaben/
            Vorauszahlung. &bdquo;Nebenkostenabrechnung
            offen (Vorjahr)&ldquo; zeigt den offenen Saldo der {jahr - 1}er-Abrechnung (eine
            Nebenkostenabrechnung wird typischerweise erst im Folgejahr beglichen, fließt daher erst
            in Saldo neu ein, nicht in Saldo alt): positiv = noch auszuzahlendes Guthaben, negativ =
            noch einzuziehende Nachzahlung. Die Spalte &bdquo;Gutschrift unbezahlte NK-Vorauszahlung&ldquo;
            gleicht den unbezahlten Teil der Vorauszahlung aus: Er steht schon als
            Rückstand in Soll/Saldo alt, die Abrechnung vergleicht die Kosten aber nur mit der
            tatsächlich gezahlten Vorauszahlung. Sie zählt ab dem Versanddatum der Abrechnung (Nebenkostenabrechnung →
            &bdquo;Als versendet markieren&ldquo;), im Zeitraum des Versands als Spalte, danach in Saldo alt; eine nicht
            versendete berechnete Abrechnung zählt weder mit Nachzahlung/Guthaben noch mit Gutschrift. Im Mieterkonto des Mietvertrags steht Saldo neu als
            &bdquo;Saldo inkl. offener Nebenkostenabrechnung&ldquo;.
          </p>
          {!zeitraum.mitNkOffen && (
            <p className="mb-3 text-sm text-neutral-400">
              In {label} ist die Nebenkostenabrechnung des Vorjahres noch nicht berücksichtigt (sie
              liegt meist erst im 3. Quartal vor): Saldo neu = Saldo alt − Soll + Miete
              (+ Gebühren/Sonderforderungen), ohne Spalte &bdquo;Nebenkostenabrechnung offen (Vorjahr)&ldquo;.
              Wurde eine Abrechnung schon im Quartal versendet, zählt ihre Gutschrift der unbezahlten
              NK-Vorauszahlung ab dem Versanddatum mit (eigene Spalte).
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
            Soll, Miete und Saldo rechnen ab dem Buchhaltungs-Stichtag des Objekts. Einzelne Mietverträge
            können einen früheren eigenen Stichtag haben (Mietvertrag bearbeiten → „Buchhaltung ab“), wenn
            ab diesem Datum alle Zahlungen vollständig erfasst sind; sie sind in der Tabelle mit „Stichtag …“
            gekennzeichnet und rechnen auch ihre früheren Jahre. Die Summenzeile mischt dann
            unterschiedliche Stichtage.
          </p>
          <p className="mb-3 text-sm text-neutral-400">
            Mieter ohne Bewegung und mit Saldo 0 werden ausgeblendet — außer sie haben einen
            Kommentar: Diese Zeilen bleiben sichtbar, damit der Kommentar zum Abgleich mit dem früheren
            Verwalter erhalten bleibt (z.B. ein dort noch offener Rückstand, der in der App längst
            beglichen ist).
          </p>
          </div>
        </details>
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
            nebenkostenGegenrechnung: z.nebenkostenGegenrechnung,
            saldoNeu: z.saldoNeu,
            verifiziert: verifizierteIds.has(z.mietvertragId),
            kommentar: kommentarNachMietvertrag.get(z.mietvertragId) ?? "",
            eigenerStichtag: z.eigenerStichtag,
          }))}
          jahr={jahr}
          quartal={quartal}
          label={label}
          mitNkOffen={zeitraum.mitNkOffen}
        />
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

      {!istQuartal && <AnlageVAufstellung jahr={jahr} daten={daten} />}

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
                    <td className="px-4 py-2 text-white">+ durchlaufende Posten (Kaution/Mietweiterleitung/Darlehenstilgung)</td>
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
    </div>
  );
}

type JahresDaten = Awaited<ReturnType<typeof ladeJahresuebersicht>>;

// Aufstellung für den Steuerberater (Anlage V): dasselbe Ergebnis wie oben, aber Mieten und Nebenkosten
// getrennt, Instandhaltung separat und die übrigen Kosten nach umlagefähig / nicht umlagefähig.
// AfA ist nicht im Journal — der Überschuss gilt vor ihr. Schuldzinsen: über das Mietkonto gebuchte plus die Jahreswerte
// von anderen Konten (Seite „Darlehen“, laut Bankbescheinigung).
function AnlageVAufstellung({ jahr, daten }: { jahr: number; daten: JahresDaten }) {
  const st = daten.steuer;
  type Zeile = { text: string; betrag: number; hinweis?: string; fett?: boolean; davon?: boolean };
  const einnahmen: Zeile[] = [
    {
      text: "Vereinnahmte Mieten (Kaltmiete, netto)",
      betrag: st.mieten,
      hinweis:
        "Zahlungen je Monat zuerst auf die NK-Vorauszahlung angerechnet, der Rest ist Kaltmiete" +
        (st.kautionMitMiete !== 0 ? `; darin ${formatEuro(st.kautionMitMiete)} mit Kaution verrechnet` : ""),
    },
    ...(st.umsatzsteuer !== 0
      ? [{ text: "Vereinnahmte Umsatzsteuer (Garagenmieten)", betrag: st.umsatzsteuer, hinweis: "anteilig aus den Garagen-Zahlungen, keine Nebenkosten" }]
      : []),
    {
      text: "Vereinnahmte Nebenkosten",
      betrag: st.nebenkosten,
      hinweis: "Vorauszahlungen + Nachzahlungen − ausgezahlte Guthaben",
    },
    { text: "davon Vorauszahlungen", betrag: st.nkVorauszahlungen, davon: true },
    {
      text: "davon Nachzahlungen aus der Abrechnung",
      betrag: st.nkNachzahlungen,
      davon: true,
      hinweis: st.kautionMitNk !== 0 ? `darin ${formatEuro(st.kautionMitNk)} mit Kaution verrechnet` : undefined,
    },
    { text: "davon Erstattungen (ausgezahlte Guthaben)", betrag: -st.nkGuthaben, davon: true },
    { text: "Sonstige Einnahmen (Waschgeld, Gebühren)", betrag: st.sonstigeEinnahmen },
    { text: "Summe der Einnahmen", betrag: st.summeEinnahmen, fett: true },
  ];
  const kosten: Zeile[] = [
    { text: "Instandhaltung (Reparaturen)", betrag: st.instandhaltung },
    { text: "Umlagefähige Kosten", betrag: st.umlagefaehig },
    { text: "Nicht umlagefähige Kosten", betrag: st.nichtUmlagefaehig },
    ...(st.schuldzinsenGesamt !== 0
      ? [
          { text: "Schuldzinsen (Darlehen)", betrag: st.schuldzinsenGesamt, hinweis: schuldzinsenHinweis(st) },
          ...(st.schuldzinsenAndere !== 0
            ? [
                { text: "davon über das Mietkonto gezahlt", betrag: st.schuldzinsen, davon: true },
                { text: "davon von anderen Konten (Bankbescheinigung)", betrag: st.schuldzinsenAndere, davon: true },
              ]
            : []),
        ]
      : []),
    { text: "Summe der Kosten", betrag: st.summeKosten, fett: true },
  ];
  const afa = afaEinzelposten(daten.afaPositionen);
  // Kostenarten, bei denen offen sein kann, ob es Instandhaltung oder Herstellungskosten (AfA) ist.
  const zuPruefen = daten.steuerKosten.filter(
    (k) => k.automatisch && k.summe !== 0 && k.gruppe === "NICHT_UMLAGEFAEHIG" && /modernisier|sanier|ausstattung|umbau/i.test(k.name),
  );

  const tabelle = (titel: string, zeilen: Zeile[]) => (
    <div>
      <h3 className="mb-2 text-sm font-medium text-neutral-300">{titel}</h3>
      <div className="rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.text} className="border-b border-neutral-800 last:border-b-0">
                <td className={`px-4 py-2 ${z.fett ? "font-medium text-white" : z.davon ? "pl-8 text-xs text-neutral-400" : "text-white"}`}>
                  {z.text}
                  {z.hinweis && <span className="mt-0.5 block text-xs font-normal text-neutral-500">{z.hinweis}</span>}
                </td>
                <td className={`whitespace-nowrap px-4 py-2 text-right ${z.fett ? "font-medium text-white" : z.davon ? "text-xs text-neutral-400" : "text-white"}`}>
                  {formatEuro(z.betrag)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-medium text-white">Aufstellung für die Steuererklärung {jahr}</h2>
      <p className="mb-3 max-w-3xl text-sm text-neutral-400">
        Dasselbe Ergebnis wie oben, gegliedert für die Anlage V: tatsächlich vereinnahmte Mieten und
        Nebenkosten getrennt, Instandhaltung separat, übrige Kosten nach umlagefähig / nicht umlagefähig.
        Ausgezahlte NK-Guthaben mindern die Nebenkosten-Einnahmen (Anlage V, Z. 13). AfA ist hier nicht
        enthalten; Schuldzinsen = über das Mietkonto gezahlte plus die Jahreswerte von anderen Konten (Seite „Darlehen“); Anschaffungs- und Herstellungskosten (Kostenarten mit Einordnung
        „Anschaffung / Herstellung“, ab 2026) stehen gesondert als Grundlage der Abschreibung.
      </p>
      <div className="grid grid-cols-2 gap-6">
        {tabelle("Einnahmen", einnahmen)}
        {tabelle("Kosten", kosten)}
      </div>
      {afa.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-medium text-neutral-300">
            Anschaffungs- und Herstellungskosten — Grundlage der Abschreibung (nicht in den Kosten)
          </h3>
          <div className="rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {afa.map((e, i) => (
                  <tr key={i} className="border-b border-neutral-800 align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-400">{e.datum}</td>
                    <td className="px-4 py-2 text-white">
                      {e.objekt}
                      <span className={`ml-2 text-xs ${e.bezugsbereit ? "text-neutral-400" : "text-amber-400"}`}>
                        ({e.bezugsbereit || "bezugsbereit ab: fehlt — Kostenposition bearbeiten"}
                        {e.vermietung && `; ${e.vermietung}`})
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {e.kostenart}
                        {e.beschreibung && ` · ${e.beschreibung}`}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(e.betrag)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2 font-medium text-white" colSpan={2}>
                    Summe Anschaffung / Herstellung
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-white">{formatEuro(st.anschaffung)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="mt-4 rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-neutral-800">
              <td className="px-4 py-2 text-neutral-400">Ergebnis laut Bericht oben (nach Zahlungsdatum)</td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-400">{formatEuro(st.ueberschussBericht)}</td>
            </tr>
            {st.anschaffung !== 0 && (
              <tr className="border-b border-neutral-800">
                <td className="px-4 py-2 text-white">
                  Zuzüglich Anschaffungs-/Herstellungskosten
                  <span className="ml-2 text-xs text-neutral-500">(im Bericht als Ausgabe, hier über die AfA)</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(st.anschaffung)}</td>
              </tr>
            )}
            {st.schuldzinsenAndere !== 0 && (
              <tr className="border-b border-neutral-800">
                <td className="px-4 py-2 text-white">
                  Abzüglich Schuldzinsen von anderen Konten
                  <span className="ml-2 text-xs text-neutral-500">(Jahreswerte laut Bankbescheinigung, nicht im Bericht)</span>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(-st.schuldzinsenAndere)}</td>
              </tr>
            )}
            <tr className="border-b border-neutral-800">
              <td className="px-4 py-2 text-white">
                Zuzüglich Dezember-Zahlungen {jahr - 1} für Januar {jahr}
                <span className="ml-2 text-xs text-neutral-500">({st.anzahlHinzu} Zahlungen, 10-Tage-Regel)</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(st.abgrenzungHinzu)}</td>
            </tr>
            <tr className="border-b border-neutral-800">
              <td className="px-4 py-2 text-white">
                Abzüglich Dezember-Zahlungen {jahr} für Januar {jahr + 1}
                <span className="ml-2 text-xs text-neutral-500">({st.anzahlHeraus} Zahlungen, 10-Tage-Regel)</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(-st.abgrenzungHeraus)}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium text-white">{ueberschussBezeichnung(st).replace(" (Einnahmen − Kosten)", "")}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-white">{formatEuro(st.ueberschuss)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-sm">
        <Link prefetch={false} href={`/jahresuebersicht/aufstellung?jahr=${jahr}`} className="text-neutral-300 underline hover:text-white">
          Aufstellung drucken / als PDF
        </Link>
        <a href={`/api/aufstellung?jahr=${jahr}`} className="text-neutral-300 underline hover:text-white">
          Als CSV herunterladen
        </a>
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-neutral-400 hover:text-white">
          Hinweise zur Aufstellung
        </summary>
        <div className="mt-3 max-w-3xl space-y-2 text-sm text-neutral-400">
          <p>
            Grundlage ist die Rückmeldung des Steuerberaters: Ein Jahresbericht mit Einnahmen und Ausgaben
            genügt (keine Einzelbuchungen); wichtig sind tatsächlich vereinnahmte Mieten und Nebenkosten,
            separat ausgewiesene Instandhaltung und die Unterteilung der Kosten in umlagefähig / nicht
            umlagefähig. Eine weitere Gliederung der laufenden Betriebskosten ist nicht nötig.
          </p>
          <p>
            Mieten und Nebenkosten: Jede Mietzahlung wird je Mietmonat zuerst auf die NK-Vorauszahlung
            angerechnet (höchstens das NK-Soll, § 366 Abs. 2 BGB — wie in der Nebenkostenabrechnung), der Rest
            ist Kaltmiete (z.B. 380 € bei 280 € NK = 280 € Nebenkosten + 100 € Kaltmiete). Maßgeblich für den
            Zeitraum ist das Zahlungsdatum, für die Aufteilung der Mietmonat. Ausgezahlte NK-Guthaben mindern
            die Nebenkosten-Einnahmen, Nachzahlungen erhöhen sie (wie Anlage V, Z. 13); im Bericht oben stehen
            sie dagegen als Ausgabe bzw. Einnahme — das Ergebnis ist gleich.
          </p>
          <p>
            10-Tage-Regel (§ 11 Abs. 1 Satz 2 EStG): Eine im Voraus gezahlte Januarmiete, die ab dem 22.12.
            eingeht, zählt zum neuen Jahr (Fälligkeit im Januar, Mietperiode Januar). Die Mieten und Nebenkosten
            der Aufstellung sind danach zugeordnet; der Bericht oben und der Kontenabgleich zählen dagegen nach
            Zahlungsdatum — die Zeilen unter der Tabelle leiten über. Eine im Januar gezahlte Dezembermiete ist
            nicht betroffen (war schon im Dezember fällig). Für Kosten ist die Regel nicht umgesetzt. Greift nur,
            wenn die Mietperiode der Zahlung stimmt.
          </p>
          <p>
            Umsatzsteuer: Garagenmieten enthalten Umsatzsteuer (Vertragsfeld „Mehrwertsteuer“); sie ist anteilig aus
            den Zahlungen herausgerechnet und steht als eigene Zeile, nicht in der Kaltmiete und nicht bei den
            Nebenkosten. Ob und wie sie an das Finanzamt abgeführt wird, ist in der App nicht erfasst.
          </p>
          <p>
            Nicht enthalten: AfA, der Überschuss gilt daher vor ihr. Schuldzinsen der Darlehen = die über das
            Mietkonto gebuchten Zinsen plus die Jahreswerte von anderen Konten, die unter Darlehen laut
            Bankbescheinigung erfasst werden (ohne diese Jahreswerte fehlen die Zinsen aus der Zeit vor dem Wechsel
            der Darlehen auf das Mietkonto, der Steuerberater ergänzt sie dann); die Tilgung ist keine Ausgabe und steht nirgends in der Aufstellung. Anschaffungs- und Herstellungskosten (z.B. Einbauküche, Modernisierung, Sanierung)
            sind nicht sofort abziehbar: Kostenarten mit der Einordnung „Anschaffung / Herstellung“ zählen ab dem
            Berichtsjahr 2026 nicht mehr zu den Kosten, sondern stehen mit ihren Einzelposten gesondert; die
            Abschreibung (Nutzungsdauer, Gebäude oder bewegliches Wirtschaftsgut) bestimmt der Steuerberater. Im
            Jahresbericht darüber bleiben sie als Ausgabe (Abfluss, passend zum Kontoauszug), der Überschuss der
            Aufstellung weicht deshalb genau um diese Summe ab. Ob Sanierung/Modernisierung
            Instandhaltung oder Herstellungskosten sind, ist mit dem Steuerberater zu klären.
          </p>
        </div>
        <h3 className="mb-2 mt-4 text-sm font-medium text-neutral-300">Zuordnung der Kostenarten</h3>
        <div className="mt-3 max-h-[400px] overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <tbody>
              {daten.steuerKosten.map((k) => (
                <tr key={k.name} className="border-b border-neutral-800">
                  <td className="px-4 py-2 text-white">{k.name}</td>
                  <td className="px-4 py-2 text-neutral-400">
                    {KOSTENGRUPPE_LABEL[k.gruppe]}
                    {k.automatisch && <span className="ml-1 text-xs text-neutral-500">(automatisch)</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-white">{formatEuro(k.summe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          „Instandhaltung“, „Anschaffung / Herstellung“ und „Sonstige Einnahme“ lassen sich unter{" "}
          <Link href="/kostenarten" className="underline hover:text-white">
            Kostenarten
          </Link>{" "}
          festlegen; sonst entscheidet die Umlagefähigkeit (Reparaturen automatisch als Instandhaltung).
          {zuPruefen.length > 0 &&
            ` Prüfen: ${zuPruefen.map((k) => k.name).join(", ")} — ggf. Instandhaltung oder Herstellungskosten (AfA) statt laufender Kosten.`}
        </p>
      </details>
    </div>
  );
}
