// Lädt die Grundlagen der Kontoprognose (siehe kontoprognose.ts) und rechnet sie durch. Nur lesend.
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { sollAufschluesselung, mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import { effektiverStichtag } from "@/lib/buchhaltung-stichtag";
import { berechneTilgungsplan, type Zinsstufe } from "@/lib/tilgungsplan";
import { MIETKONTO_AB } from "@/lib/darlehenskonto";
import { ladeDarlehenIst } from "@/lib/darlehenskonto-laden";
import {
  ANPASSBARE_KOSTENARTEN,
  VERWALTUNG_UEBERNOMMEN,
  KOSTEN_RUECKBLICK_MONATE,
  MIETE_RUECKBLICK_MONATE,
  WEITERLEITUNG_RUECKBLICK_MONATE,
  berechneKontoprognose,
  indexZuMonat,
  monatsIndex,
  schaetzeKosten,
  schlageKostenAnteilVor,
  typischeWeiterleitung,
  zahlungsquote,
  type KostenAnsatz,
  type KostenBuchung,
  type KostenVorschlagRechnung,
  type OffeneRate,
  type Prognose,
} from "@/lib/kontoprognose";

export type PrognoseParameter = {
  monate: number;
  /** Euro je Monat; null = automatisch aus den letzten Monaten. */
  weiterleitung: number | null;
  nkAusgleich: "vorjahr" | "keiner";
  /** Anteil der bisherigen Höhe je Kostenart (Name → 0 bis ...; 1 = unverändert, 0 = entfällt); fehlt eine Kostenart, gilt 1. */
  kostenAnteile: Record<string, number>;
};

export type KontoprognoseErgebnis = {
  prognose: Prognose;
  startStand: number;
  /** Datum der letzten Buchung bis zum Stichtag (Grundlage des Startstands). */
  letzteBuchung: Date | null;
  startJahr: number;
  startMonat: number;
  /** Zahlungsquote der Miete (0 bis 1), automatisch aus den letzten 6 Monaten. */
  quote: number;
  weiterleitung: { verwendet: number; automatisch: number; monateGrundlage: number };
  nkVorjahr: number;
  kosten: KostenAnsatz[];
  /** Von Hand angepasste Kostenarten: Anteil und Summe der letzten 12 Monate (vor der Anpassung). */
  kostenAngepasst: { kostenart: string; anteil: number; summe: number }[];
  darlehensraten: OffeneRate[];
  vertraegeInPrognose: number;
  parameter: PrognoseParameter;
};

const ersterTag = (index: number) => {
  const { jahr, monat } = indexZuMonat(index);
  return new Date(Date.UTC(jahr, monat - 1, 1));
};
const utcIndex = (d: Date) => monatsIndex(d.getUTCFullYear(), d.getUTCMonth() + 1);

/** Rechnet die Prognose. `null`, wenn am Objekt kein Kontostand-Anker hinterlegt ist. */
export async function ladeKontoprognose(parameter: PrognoseParameter, heute: Date = new Date()): Promise<KontoprognoseErgebnis | null> {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true, buchhaltungAb: true },
  });
  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) return null;
  const anker = { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) };

  const startIndex = utcIndex(heute);
  const { jahr: startJahr, monat: startMonat } = indexZuMonat(startIndex);
  const letzterIndex = startIndex + parameter.monate - 1;
  const horizontEnde = new Date(indexZuMonat(letzterIndex + 1).jahr, indexZuMonat(letzterIndex + 1).monat - 1, 0);

  const aktiv = { ...AKTIVE_BUCHUNG_FILTER };
  const [eintraege, vertraege, mietzahlungen, kostenBuchungen, weiterleitungen, nkBuchungen, darlehen, darlehenIst] = await Promise.all([
    ladeKontostandEintraege(),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET", "GEPLANT"] } },
      select: {
        status: true,
        beginn: true,
        ende: true,
        kaltmiete: true,
        nebenkostenVorauszahlung: true,
        mehrwertsteuer: true,
        buchhaltungAb: true,
        mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
        mietnachlaesse: { select: { jahr: true, monat: true, betrag: true } },
      },
    }),
    prisma.buchung.findMany({
      where: { ...aktiv, buchungsart: { code: "MIETZAHLUNG" }, datum: { gte: ersterTag(startIndex - MIETE_RUECKBLICK_MONATE) } },
      select: { datum: true, betrag: true },
    }),
    // Schuldzinsen kommen aus dem Tilgungsplan (Darlehensraten), nicht aus der Kostenschätzung (siehe Schleife unten).
    prisma.buchung.findMany({
      where: {
        ...aktiv,
        buchungsart: { code: "KOSTENPOSITION", zahlungswirksam: true },
        datum: { gte: ersterTag(startIndex - KOSTEN_RUECKBLICK_MONATE) },
      },
      select: { datum: true, betrag: true, kostenart: { select: { name: true, anlageVZeile: true } } },
    }),
    prisma.buchung.findMany({
      where: { ...aktiv, buchungsart: { code: "MIETWEITERLEITUNG" }, datum: { gte: ersterTag(startIndex - WEITERLEITUNG_RUECKBLICK_MONATE) } },
      select: { datum: true, betrag: true },
    }),
    prisma.buchung.findMany({
      where: { ...aktiv, buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, datum: { gte: ersterTag(startIndex - 12) } },
      select: { datum: true, betrag: true },
    }),
    prisma.darlehen.findMany({ where: { aktiv: true } }),
    ladeDarlehenIst(),
  ]);

  // Startstand: alles bis einschließlich heute.
  const stichtag = new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), heute.getUTCDate(), 23, 59, 59, 999));
  const startStand = kontostandAmStichtag(eintraege, anker, stichtag);
  const bisHeute = eintraege.filter((e) => e.datum.getTime() <= stichtag.getTime());
  const letzteBuchung = bisHeute.reduce<Date | null>((l, e) => (l === null || e.datum > l ? e.datum : l), null);

  // Soll je Monat. Vergangene Monate (alle Verträge) liefern die Zahlungsquote, künftige nur aktive/geplante Verträge.
  const sollJeMonat = new Map<number, number>();
  const sollHistorie = new Map<number, number>();
  let vertraegeInPrognose = 0;
  for (const v of vertraege) {
    const zeilen = sollAufschluesselung(
      {
        beginn: v.beginn,
        ende: v.ende,
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
        mieterhoehungen: v.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
        mietnachlaesse: mietnachlaesseFuerSoll(v.mietnachlaesse),
      },
      horizontEnde,
      effektiverStichtag(v, objekt),
    );
    let beitragZukunft = false;
    for (const z of zeilen) {
      const index = monatsIndex(z.jahr, z.monat);
      if (index < startIndex) {
        sollHistorie.set(index, (sollHistorie.get(index) ?? 0) + z.betrag);
      } else if (v.status !== "BEENDET") {
        sollJeMonat.set(index, (sollJeMonat.get(index) ?? 0) + z.betrag);
        beitragZukunft = true;
      }
    }
    if (beitragZukunft) vertraegeInPrognose++;
  }

  // Zahlungsquote: Mietzahlungen der letzten Monate gegen das Soll derselben Monate (nach Buchungsdatum, wie der Kontostand).
  let gezahltRueckblick = 0;
  let sollRueckblick = 0;
  let mieteBereitsGebucht = 0;
  for (const z of mietzahlungen) {
    if (!z.datum) continue;
    const index = utcIndex(z.datum);
    if (index >= startIndex) mieteBereitsGebucht += Number(z.betrag);
    else gezahltRueckblick += Number(z.betrag);
  }
  for (let i = startIndex - MIETE_RUECKBLICK_MONATE; i < startIndex; i++) sollRueckblick += sollHistorie.get(i) ?? 0;
  const quote = zahlungsquote(gezahltRueckblick, sollRueckblick);

  // Kosten.
  const kostenHistorie: KostenBuchung[] = [];
  const kostenBereitsGebucht = new Map<string, number>();
  for (const k of kostenBuchungen) {
    // Ein `NOT` auf anlageVZeile würde in SQL auch alle Kostenarten ohne Einordnung (NULL) ausschließen — deshalb hier filtern.
    if (!k.datum || k.kostenart?.anlageVZeile === "SCHULDZINSEN") continue;
    const name = k.kostenart?.name ?? "Ohne Kostenart";
    const index = utcIndex(k.datum);
    if (index >= startIndex) kostenBereitsGebucht.set(name, (kostenBereitsGebucht.get(name) ?? 0) + Number(k.betrag));
    kostenHistorie.push({ kostenart: name, index, betrag: Number(k.betrag) });
  }
  const alleKosten = schaetzeKosten(kostenHistorie, startIndex);
  const anteil = (name: string) => parameter.kostenAnteile[name] ?? 1;
  const kosten = alleKosten.map((k) =>
    anteil(k.kostenart) === 1 ? k : { ...k, jeKalendermonat: k.jeKalendermonat.map((v) => Math.round(v * anteil(k.kostenart) * 100) / 100) },
  );
  const kostenAngepasst = alleKosten.filter((k) => anteil(k.kostenart) !== 1).map((k) => ({ kostenart: k.kostenart, anteil: anteil(k.kostenart), summe: k.summe }));

  // Darlehensraten laut Tilgungsplan, soweit für den Monat noch nicht gebucht (ab Mietkonto-Beginn).
  const mietkontoIndex = monatsIndex(MIETKONTO_AB.jahr, MIETKONTO_AB.monat);
  const darlehensraten: OffeneRate[] = [];
  for (const d of darlehen) {
    const raten = berechneTilgungsplan({
      startRestschuld: Number(d.startRestschuld),
      startDatum: d.startDatum,
      rate: Number(d.rate),
      zinssatz: Number(d.zinssatz),
      zahltag: d.zahltag,
      laufzeitEnde: d.laufzeitEnde,
      zinsbindungBis: d.zinsbindungBis,
      stufen: (d.stufen as Zinsstufe[] | null) ?? [],
    });
    const gebucht = new Set((darlehenIst.get(d.id) ?? []).filter((i) => !i.sonder).map((i) => monatsIndex(i.periodeJahr, i.periodeMonat)));
    for (const r of raten) {
      const index = monatsIndex(r.jahr, r.monat);
      if (index < Math.max(startIndex, mietkontoIndex) || index > letzterIndex || gebucht.has(index)) continue;
      darlehensraten.push({ index, darlehen: d.bezeichnung, rate: r.rate, zins: r.zins, tilgung: r.tilgung });
    }
  }

  // Weiterleitung: Median der letzten vollen Monate (netto je Monat), im laufenden Monat zählt Gebuchtes mit.
  const weiterleitungJeMonat = new Map<number, number>();
  for (const w of weiterleitungen) {
    if (!w.datum) continue;
    const index = utcIndex(w.datum);
    weiterleitungJeMonat.set(index, (weiterleitungJeMonat.get(index) ?? 0) + Number(w.betrag));
  }
  const weiterleitungNetto: number[] = [];
  for (let i = startIndex - WEITERLEITUNG_RUECKBLICK_MONATE; i < startIndex; i++) weiterleitungNetto.push(weiterleitungJeMonat.get(i) ?? 0);
  const weiterleitungAutomatisch = typischeWeiterleitung(weiterleitungNetto);
  const weiterleitung = parameter.weiterleitung ?? weiterleitungAutomatisch;

  // Nebenkostenausgleich: je Kalendermonat der Wert des Vorjahresmonats.
  const nkJeKalendermonat = new Array<number>(12).fill(0);
  let nkBereitsGebucht = 0;
  let nkVorjahr = 0;
  for (const n of nkBuchungen) {
    if (!n.datum) continue;
    const index = utcIndex(n.datum);
    if (index >= startIndex) {
      nkBereitsGebucht += Number(n.betrag);
    } else {
      nkJeKalendermonat[indexZuMonat(index).monat - 1] += Number(n.betrag);
      nkVorjahr += Number(n.betrag);
    }
  }

  const prognose = berechneKontoprognose({
    startIndex,
    monate: parameter.monate,
    startStand,
    sollJeMonat,
    quote,
    mieteBereitsGebucht,
    kosten,
    kostenBereitsGebucht,
    darlehensraten,
    weiterleitung,
    weiterleitungBereitsGebucht: Math.max(0, -(weiterleitungJeMonat.get(startIndex) ?? 0)),
    nkAusgleichJeKalendermonat: parameter.nkAusgleich === "vorjahr" ? nkJeKalendermonat : null,
    nkAusgleichBereitsGebucht: nkBereitsGebucht,
    mindestbestand: 0,
  });

  return {
    prognose,
    startStand,
    letzteBuchung,
    startJahr,
    startMonat,
    quote,
    weiterleitung: { verwendet: weiterleitung, automatisch: weiterleitungAutomatisch, monateGrundlage: WEITERLEITUNG_RUECKBLICK_MONATE },
    nkVorjahr: Math.round(nkVorjahr * 100) / 100,
    kosten,
    kostenAngepasst,
    darlehensraten,
    vertraegeInPrognose,
    parameter,
  };
}

export type KostenVorschlag = { kostenart: string; param: string } & KostenVorschlagRechnung;

/**
 * Vorschlag für die drei anpassbaren Kostenarten aus den vollen Monaten seit der Übernahme der Verwaltung
 * (siehe `schlageKostenAnteilVor`). Liefert nur Zeilen mit Ergebnis; leer, solange noch kein voller Monat vorliegt.
 */
export async function ladeKostenVorschlag(heute: Date = new Date()): Promise<{ zeilen: KostenVorschlag[]; monateSeit: number }> {
  const startIndex = utcIndex(heute);
  const uebernahmeIndex = monatsIndex(VERWALTUNG_UEBERNOMMEN.jahr, VERWALTUNG_UEBERNOMMEN.monat);
  const monateSeit = Math.max(0, startIndex - uebernahmeIndex);
  if (monateSeit < 1) return { zeilen: [], monateSeit };

  const buchungen = await prisma.buchung.findMany({
    where: {
      ...AKTIVE_BUCHUNG_FILTER,
      buchungsart: { code: "KOSTENPOSITION", zahlungswirksam: true },
      datum: { gte: ersterTag(uebernahmeIndex - KOSTEN_RUECKBLICK_MONATE), lt: ersterTag(startIndex) },
      kostenart: { name: { in: ANPASSBARE_KOSTENARTEN.map((k) => k.name) } },
    },
    select: { datum: true, betrag: true, kostenart: { select: { name: true } } },
  });

  const zeilen: KostenVorschlag[] = [];
  for (const k of ANPASSBARE_KOSTENARTEN) {
    const historie: KostenBuchung[] = buchungen
      .filter((b) => b.datum && b.kostenart?.name === k.name)
      .map((b) => ({ kostenart: k.name, index: utcIndex(b.datum!), betrag: Number(b.betrag) }));
    const rechnung = schlageKostenAnteilVor(historie, uebernahmeIndex, startIndex);
    if (rechnung) zeilen.push({ kostenart: k.name, param: k.param, ...rechnung });
  }
  return { zeilen, monateSeit };
}
