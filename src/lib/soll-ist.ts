export function monateInklusive(vonJahr: number, vonMonat: number, bisJahr: number, bisMonat: number) {
  return bisJahr * 12 + bisMonat - (vonJahr * 12 + vonMonat) + 1;
}

export type MietvertragFuerSollIst = {
  beginn: Date | null; // null = unbekannt, wird wie ein beliebig weit zurückliegendes Datum behandelt
  ende: Date | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
  mehrwertsteuer?: number;
  // Historie von Mieterhöhungen, aufsteigend oder unsortiert — leeres Array = unverändert wie
  // bisher (Basiswerte gelten die ganze Laufzeit). Siehe ermittleMieteFuerMonat.
  mieterhoehungen?: { gueltigAb: Date; kaltmiete: number; nebenkostenVorauszahlung: number }[];
};

/**
 * Ermittelt die für einen bestimmten Monat gültige Kaltmiete/NK-Vorauszahlung: die letzte
 * Mieterhöhung, deren gueltigAb-Monat kleiner-gleich dem gefragten Monat ist — gibt es keine
 * (noch keine Mieterhöhung erreicht bzw. keine vorhanden), gelten die Basiswerte des
 * Mietvertrags.
 */
export function ermittleMieteFuerMonat(
  vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">,
  jahr: number,
  monat: number,
): { kaltmiete: number; nebenkostenVorauszahlung: number } {
  const zielIndex = jahr * 12 + monat;
  let aktuell = { kaltmiete: vertrag.kaltmiete, nebenkostenVorauszahlung: vertrag.nebenkostenVorauszahlung };
  let bestesGueltigAbIndex = -Infinity;
  for (const mh of vertrag.mieterhoehungen ?? []) {
    const gueltigAbIndex = mh.gueltigAb.getFullYear() * 12 + (mh.gueltigAb.getMonth() + 1);
    if (gueltigAbIndex <= zielIndex && gueltigAbIndex > bestesGueltigAbIndex) {
      bestesGueltigAbIndex = gueltigAbIndex;
      aktuell = { kaltmiete: mh.kaltmiete, nebenkostenVorauszahlung: mh.nebenkostenVorauszahlung };
    }
  }
  return aktuell;
}

/** Wie ermittleMieteFuerMonat, aber für einen einzelnen Stichtag statt eine Monatsreihe. */
export function ermittleAktuelleMiete(
  vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">,
  stichtag: Date = new Date(),
): { kaltmiete: number; nebenkostenVorauszahlung: number } {
  return ermittleMieteFuerMonat(vertrag, stichtag.getFullYear(), stichtag.getMonth() + 1);
}

export type SollZeile = {
  jahr: number;
  monat: number; // 1-12
  faelligAm: Date;
  betrag: number;
  // Kaltmiete-Anteil von betrag — für Aufschlüsselungen, die Kaltmiete getrennt von
  // Nebenkosten/Mehrwertsteuer zeigen wollen (z.B. der Mieter-Jahresbericht). Der
  // Nebenkosten-Anteil (inkl. ggf. Mehrwertsteuer bei Garagen) ergibt sich als betrag - kaltmiete.
  kaltmiete: number;
};

/** Der dritte Werktag (Mo–Fr) eines Monats — üblicher vertraglicher Fälligkeitstermin für Miete. */
function dritterWerktagDesMonats(jahr: number, monatIndex0: number): Date {
  let werktage = 0;
  let tag = 1;
  while (true) {
    const datum = new Date(jahr, monatIndex0, tag);
    const wochentag = datum.getDay(); // 0 = Sonntag, 6 = Samstag
    if (wochentag !== 0 && wochentag !== 6) {
      werktage++;
      if (werktage === 3) return datum;
    }
    tag++;
  }
}

/**
 * Aufschlüsselung des Solls pro Monat — jeweils mit vertraglichem Fälligkeitstermin (3. Werktag
 * des Monats, "im Voraus" fällig). Läuft von Mietbeginn (bzw. `buchhaltungAb`, falls später) bis
 * `heute` (bzw. Mietende, falls dieses früher liegt) — jeder angebrochene Monat zählt bereits
 * ab seinem 1. Tag voll, da die Miete für den ganzen Monat im Voraus zu zahlen ist.
 */
export function sollAufschluesselung(
  vertrag: MietvertragFuerSollIst,
  heute: Date = new Date(),
  buchhaltungAb: Date | null = null,
): SollZeile[] {
  const referenz = vertrag.ende && vertrag.ende < heute ? vertrag.ende : heute;
  // Ein unbekannter Mietbeginn zählt wie ein beliebig weit zurückliegendes Datum — es bleibt
  // also bei buchhaltungAb, falls gesetzt. Ist auch das nicht gesetzt, fehlt jeder Referenzpunkt
  // und es lässt sich kein Soll berechnen (kommt praktisch nicht vor, da buchhaltungAb global
  // konfiguriert ist).
  const start =
    vertrag.beginn === null
      ? buchhaltungAb
      : buchhaltungAb && buchhaltungAb > vertrag.beginn
        ? buchhaltungAb
        : vertrag.beginn;
  if (!start) return [];

  const anzahlMonate = monateInklusive(
    start.getFullYear(),
    start.getMonth() + 1,
    referenz.getFullYear(),
    referenz.getMonth() + 1,
  );
  if (anzahlMonate <= 0) return [];

  const zeilen: SollZeile[] = [];
  let jahr = start.getFullYear();
  let monat = start.getMonth() + 1; // 1-basiert

  for (let i = 0; i < anzahlMonate; i++) {
    const { kaltmiete, nebenkostenVorauszahlung } = ermittleMieteFuerMonat(vertrag, jahr, monat);
    zeilen.push({
      jahr,
      monat,
      faelligAm: dritterWerktagDesMonats(jahr, monat - 1),
      betrag: kaltmiete + nebenkostenVorauszahlung + (vertrag.mehrwertsteuer ?? 0),
      kaltmiete,
    });
    monat++;
    if (monat > 12) {
      monat = 1;
      jahr++;
    }
  }
  return zeilen;
}

/**
 * Soll = Summe der Monatsraten seit Mietbeginn (bis heute bzw. bis Mietende, falls dieses in der
 * Vergangenheit liegt) × Warmmiete (Kaltmiete + NK-Vorauszahlung + ggf. Mehrwertsteuer, bei
 * umsatzsteuerpflichtig vermieteten Garagen/Stellplätzen anstelle von Nebenkosten).
 *
 * Liegt der Mietbeginn vor `buchhaltungAb` (z.B. weil dafür keine Kontoauszüge mehr vorliegen),
 * wird erst ab `buchhaltungAb` gerechnet — sonst würde ein jahrzehntealter Mietbeginn einen
 * riesigen, mit den tatsächlich erfassten Zahlungen nicht vergleichbaren Sollbetrag ergeben.
 */
export function berechneSoll(
  vertrag: MietvertragFuerSollIst,
  heute: Date = new Date(),
  buchhaltungAb: Date | null = null,
): number {
  return sollAufschluesselung(vertrag, heute, buchhaltungAb).reduce((sum, z) => sum + z.betrag, 0);
}

/** Wie berechneSoll, aber nur der Kaltmiete-Anteil — für Aufschlüsselungen, die Kaltmiete
 * getrennt von Nebenkosten zeigen (siehe SollZeile.kaltmiete). */
export function berechneSollKaltmiete(
  vertrag: MietvertragFuerSollIst,
  heute: Date = new Date(),
  buchhaltungAb: Date | null = null,
): number {
  return sollAufschluesselung(vertrag, heute, buchhaltungAb).reduce((sum, z) => sum + z.kaltmiete, 0);
}

/**
 * Ist = Summe der erfassten Zahlungen im Zeitraum [buchhaltungAb, buchhaltungBis], damit Ist und
 * Soll immer denselben Zeitraum abdecken. Ohne die Untergrenze würden ältere Zahlungen (die im
 * Soll seit `buchhaltungAb` gar nicht mehr mitgezählt werden) den Saldo künstlich ins Plus
 * ziehen; die Obergrenze erlaubt einen Stichtags-Rückblick (z.B. "Stand Ende letzten Monats").
 */
export function berechneIst(
  zahlungen: { datum: Date; betrag: number }[],
  buchhaltungAb: Date | null = null,
  buchhaltungBis: Date | null = null,
): number {
  return zahlungen
    .filter((z) => (!buchhaltungAb || z.datum >= buchhaltungAb) && (!buchhaltungBis || z.datum <= buchhaltungBis))
    .reduce((sum, z) => sum + z.betrag, 0);
}

/**
 * Ist nach Mietperiode statt nach Buchungsdatum: eine Zahlung zählt für den Monat, für den sie
 * gedacht ist (periodeJahr/periodeMonat; fehlt die Periode, gilt der Monat des Buchungsdatums).
 * Das ist das Gegenstück zum Soll, das ebenfalls monatsweise rechnet — eine Miete für Januar, die
 * schon am 30.12. überwiesen wird, gehört zum Januar. Der Zeitraum [buchhaltungAb, buchhaltungBis]
 * wird als Monatsbereich verstanden (angebrochene Monate zählen voll, wie im Soll).
 */
export function berechneIstNachPeriode(
  zahlungen: { datum: Date; betrag: number; periodeMonat?: number | null; periodeJahr?: number | null }[],
  buchhaltungAb: Date | null = null,
  buchhaltungBis: Date | null = null,
): number {
  const monatsIndex = (d: Date) => d.getFullYear() * 12 + (d.getMonth() + 1);
  const von = buchhaltungAb ? monatsIndex(buchhaltungAb) : -Infinity;
  const bis = buchhaltungBis ? monatsIndex(buchhaltungBis) : Infinity;
  return zahlungen
    .filter((z) => {
      const periode =
        z.periodeJahr && z.periodeMonat ? z.periodeJahr * 12 + z.periodeMonat : monatsIndex(z.datum);
      return periode >= von && periode <= bis;
    })
    .reduce((sum, z) => sum + z.betrag, 0);
}
