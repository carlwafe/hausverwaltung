// Kontoprognose: schreibt den simulierten Kontostand (siehe kontostand.ts) ab dem laufenden Monat monatsweise
// fort. Reine Funktionen ohne Datenbank; die Daten besorgt kontoprognose-laden.ts.
//
// Annahmen (bewusst einfach, auf der Seite sichtbar):
//  * Miete = Soll der laufenden/geplanten Verträge (inkl. bereits eingetragener Mieterhöhungen) × Zahlungsquote
//    der letzten Monate.
//  * Laufende Kosten je Kostenart aus den letzten 12 Monaten: wer in mindestens 8 davon vorkommt, gilt als
//    regelmäßig (Monatsmittel), sonst als unregelmäßig (Betrag im jeweiligen Vorjahresmonat).
//  * Darlehensraten laut Tilgungsplan, soweit noch nicht gebucht.
//  * Mietweiterleitung als fester Monatsbetrag, Nebenkostenausgleich wie im Vorjahr.
// Zahlungen sind positiv (Eingang), Ausgaben negativ — wie ein Kontoauszug.

export const KOSTEN_RUECKBLICK_MONATE = 12;
export const KOSTEN_REGELMAESSIG_AB = 8;
export const MIETE_RUECKBLICK_MONATE = 6;
export const WEITERLEITUNG_RUECKBLICK_MONATE = 3;

/**
 * Kostenarten, die beim Vorverwalter besonders hoch waren und nach Übernahme der Verwaltung sinken können:
 * Formularfeld (`param`) und Name der Kostenart. Eingabe als Prozent der bisherigen Höhe.
 */
export const ANPASSBARE_KOSTENARTEN = [
  { param: "verwaltung", name: "Verwaltungskosten" },
  { param: "reparaturen", name: "Reparaturen" },
  { param: "sonstige", name: "Sonstige Kosten" },
] as const;

/** Ab diesem Monat liegt die Verwaltung beim Eigentümer (Übernahme am 1.10.2026); davor zahlte das Objekt die Kosten des Vorverwalters. */
export const VERWALTUNG_UEBERNOMMEN = { jahr: 2026, monat: 10 };

const cent = (n: number) => Math.round(n * 100) / 100;

/** Fortlaufende Monatsnummer, damit sich Monate einfach vergleichen und verschieben lassen. */
export const monatsIndex = (jahr: number, monat: number) => jahr * 12 + (monat - 1);
export const indexZuMonat = (index: number) => ({ jahr: Math.floor(index / 12), monat: (index % 12) + 1 });

/** Eine gebuchte Kostenposition; positiv = Ausgabe (wie in der Buchung). */
export type KostenBuchung = { kostenart: string; index: number; betrag: number };

export type KostenAnsatz = {
  kostenart: string;
  art: "regelmaessig" | "unregelmaessig";
  /** Summe der letzten 12 Monate (positiv = Ausgabe). */
  summe: number;
  /** In wie vielen der letzten 12 Monate die Kostenart gebucht wurde. */
  monateMitBuchung: number;
  /** Erwartete Ausgabe je Kalendermonat (Index 0 = Januar), positiv = Ausgabe. */
  jeKalendermonat: number[];
};

/**
 * Schätzt die laufenden Kosten je Kostenart aus den 12 Monaten vor `startIndex` (dem laufenden Monat).
 * Buchungen ab `startIndex` zählen nicht zur Grundlage.
 */
export function schaetzeKosten(historie: KostenBuchung[], startIndex: number): KostenAnsatz[] {
  const von = startIndex - KOSTEN_RUECKBLICK_MONATE;
  const jeArt = new Map<string, Map<number, number>>();
  for (const b of historie) {
    if (b.index < von || b.index >= startIndex) continue;
    const monate = jeArt.get(b.kostenart) ?? new Map<number, number>();
    monate.set(b.index, (monate.get(b.index) ?? 0) + b.betrag);
    jeArt.set(b.kostenart, monate);
  }

  const result: KostenAnsatz[] = [];
  for (const [kostenart, monate] of jeArt) {
    const summe = cent([...monate.values()].reduce((s, v) => s + v, 0));
    const monateMitBuchung = [...monate.values()].filter((v) => Math.abs(v) >= 0.005).length;
    const regelmaessig = monateMitBuchung >= KOSTEN_REGELMAESSIG_AB;
    const jeKalendermonat = new Array<number>(12).fill(0);
    if (regelmaessig) {
      jeKalendermonat.fill(cent(summe / KOSTEN_RUECKBLICK_MONATE));
    } else {
      for (const [index, wert] of monate) jeKalendermonat[indexZuMonat(index).monat - 1] += wert;
      for (let i = 0; i < 12; i++) jeKalendermonat[i] = cent(jeKalendermonat[i]);
    }
    result.push({ kostenart, art: regelmaessig ? "regelmaessig" : "unregelmaessig", summe, monateMitBuchung, jeKalendermonat });
  }
  return result.sort((a, b) => Math.abs(b.summe) - Math.abs(a.summe));
}

/**
 * Typische Weiterleitung an die Eigentümerin: Median der monatlichen Nettoabflüsse (positiv = weitergeleitet).
 * Der Median glättet Ausreißer (ein Monat ohne oder mit doppelter Überweisung).
 */
export function typischeWeiterleitung(nettoJeMonat: number[]): number {
  const abfluesse = nettoJeMonat.map((n) => Math.max(0, -n)).sort((a, b) => a - b);
  if (abfluesse.length === 0) return 0;
  const mitte = Math.floor(abfluesse.length / 2);
  const median = abfluesse.length % 2 ? abfluesse[mitte] : (abfluesse[mitte - 1] + abfluesse[mitte]) / 2;
  return cent(median);
}

/** Anteil der Soll-Miete, der tatsächlich einging (0 bis 1); ohne Soll gilt 100 %. */
export function zahlungsquote(gezahlt: number, soll: number): number {
  if (soll <= 0) return 1;
  return Math.min(1, Math.max(0, Math.round((gezahlt / soll) * 1000) / 1000));
}

export type OffeneRate = { index: number; darlehen: string; rate: number; zins: number; tilgung: number };

export type PrognoseEingabe = {
  /** Laufender Monat (Index); er wird nur für den noch ausstehenden Rest gerechnet. */
  startIndex: number;
  monate: number;
  startStand: number;
  /** Soll der Mieten je Monatsindex (alle aktiven/geplanten Verträge). */
  sollJeMonat: Map<number, number>;
  quote: number;
  mieteBereitsGebucht: number;
  kosten: KostenAnsatz[];
  /** Im laufenden Monat schon gebuchte Kosten je Kostenart (positiv = Ausgabe). */
  kostenBereitsGebucht: Map<string, number>;
  darlehensraten: OffeneRate[];
  /** Monatlich weitergeleiteter Betrag (positiv). */
  weiterleitung: number;
  weiterleitungBereitsGebucht: number;
  /** Nebenkostenausgleich je Kalendermonat (Index 0 = Januar), Bankvorzeichen; leer = nicht berücksichtigen. */
  nkAusgleichJeKalendermonat: number[] | null;
  nkAusgleichBereitsGebucht: number;
  mindestbestand: number;
};

export type PrognoseMonat = {
  index: number;
  jahr: number;
  monat: number;
  /** Der laufende Monat: nur noch ausstehende Beträge. */
  laufend: boolean;
  miete: number;
  kosten: number;
  darlehen: number;
  weiterleitung: number;
  nkAusgleich: number;
  /** Veränderung im Monat. */
  veraenderung: number;
  endstand: number;
  unterMindestbestand: boolean;
};

export type Prognose = {
  monate: PrognoseMonat[];
  niedrigster: { index: number; jahr: number; monat: number; stand: number } | null;
  summe: { miete: number; kosten: number; darlehen: number; weiterleitung: number; nkAusgleich: number };
};

/**
 * Was im laufenden Monat noch aussteht: die Erwartung abzüglich des schon Gebuchten, nie über die Erwartung hinaus
 * und nie mit umgekehrtem Vorzeichen (eine schon überschrittene Erwartung bleibt 0).
 */
function restImLaufendenMonat(erwartet: number, gebucht: number): number {
  const rest = erwartet - gebucht;
  return erwartet < 0 ? Math.min(0, rest) : Math.max(0, rest);
}

export function berechneKontoprognose(e: PrognoseEingabe): Prognose {
  const monate: PrognoseMonat[] = [];
  let stand = e.startStand;

  for (let i = 0; i < e.monate; i++) {
    const index = e.startIndex + i;
    const { jahr, monat } = indexZuMonat(index);
    const laufend = i === 0;

    const miete = cent(Math.max(0, (e.sollJeMonat.get(index) ?? 0) * e.quote - (laufend ? e.mieteBereitsGebucht : 0)));

    let kosten = 0;
    for (const k of e.kosten) {
      const erwartet = k.jeKalendermonat[monat - 1];
      kosten += laufend ? restImLaufendenMonat(erwartet, e.kostenBereitsGebucht.get(k.kostenart) ?? 0) : erwartet;
    }
    kosten = -cent(kosten);

    const darlehen = -cent(e.darlehensraten.filter((r) => r.index === index).reduce((s, r) => s + r.rate, 0));

    const weiterleitung = -cent(Math.max(0, e.weiterleitung - (laufend ? e.weiterleitungBereitsGebucht : 0)));

    let nkAusgleich = 0;
    if (e.nkAusgleichJeKalendermonat) {
      const erwartet = e.nkAusgleichJeKalendermonat[monat - 1];
      nkAusgleich = cent(laufend ? restImLaufendenMonat(erwartet, e.nkAusgleichBereitsGebucht) : erwartet);
    }

    const veraenderung = cent(miete + kosten + darlehen + weiterleitung + nkAusgleich);
    stand = cent(stand + veraenderung);
    monate.push({
      index,
      jahr,
      monat,
      laufend,
      miete,
      kosten,
      darlehen,
      weiterleitung,
      nkAusgleich,
      veraenderung,
      endstand: stand,
      unterMindestbestand: stand < e.mindestbestand,
    });
  }

  const tiefster = monate.reduce<PrognoseMonat | null>((t, m) => (t === null || m.endstand < t.endstand ? m : t), null);
  const summe = monate.reduce(
    (s, m) => ({
      miete: cent(s.miete + m.miete),
      kosten: cent(s.kosten + m.kosten),
      darlehen: cent(s.darlehen + m.darlehen),
      weiterleitung: cent(s.weiterleitung + m.weiterleitung),
      nkAusgleich: cent(s.nkAusgleich + m.nkAusgleich),
    }),
    { miete: 0, kosten: 0, darlehen: 0, weiterleitung: 0, nkAusgleich: 0 },
  );
  return {
    monate,
    niedrigster: tiefster ? { index: tiefster.index, jahr: tiefster.jahr, monat: tiefster.monat, stand: tiefster.endstand } : null,
    summe,
  };
}

/** Liest eine Zahl aus einem Formularfeld in deutscher Schreibweise („9.000,50“, „9000“, „99,5“); leer/ungültig → null. */
export function leseZahl(wert: string | undefined | null): number | null {
  const text = (wert ?? "").replace(/[\s€%]/g, "");
  if (text === "") return null;
  const normalisiert = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : /^-?\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text;
  const zahl = Number(normalisiert);
  return Number.isFinite(zahl) ? zahl : null;
}

export type KostenVorschlagRechnung = {
  /** Monatsmittel der 12 Monate vor der Übernahme (positiv = Ausgabe). */
  vorherJeMonat: number;
  /** Monatsmittel der vollen Monate seit der Übernahme. */
  seitJeMonat: number;
  /** Anzahl der vollen Monate seit der Übernahme (ohne den laufenden). */
  monateSeit: number;
  /** Anteil der bisherigen Höhe, auf ganze Prozent gerundet (0 = entfällt); null, wenn vorher nichts gebucht war. */
  anteil: number | null;
};

/**
 * Schlägt für eine Kostenart den Anteil der bisherigen Höhe vor: Monatsmittel der vollen Monate seit der Übernahme
 * gegen das Monatsmittel der 12 Monate davor. `historie` enthält nur Buchungen dieser einen Kostenart; der laufende
 * Monat (ab `startIndex`) zählt nicht, weil er noch unvollständig ist. Ohne volle Monate seit der Übernahme → null.
 */
export function schlageKostenAnteilVor(historie: KostenBuchung[], uebernahmeIndex: number, startIndex: number): KostenVorschlagRechnung | null {
  const monateSeit = startIndex - uebernahmeIndex;
  if (monateSeit < 1) return null;
  const summe = (von: number, bis: number) => historie.filter((b) => b.index >= von && b.index <= bis).reduce((s, b) => s + b.betrag, 0);
  const vorherJeMonat = cent(summe(uebernahmeIndex - KOSTEN_RUECKBLICK_MONATE, uebernahmeIndex - 1) / KOSTEN_RUECKBLICK_MONATE);
  const seitJeMonat = cent(summe(uebernahmeIndex, startIndex - 1) / monateSeit);
  const anteil = vorherJeMonat > 0 ? Math.max(0, Math.round((seitJeMonat / vorherJeMonat) * 100) / 100) : null;
  return { vorherJeMonat, seitJeMonat, monateSeit, anteil };
}
