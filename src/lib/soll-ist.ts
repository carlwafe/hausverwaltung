export function monateInklusive(vonJahr: number, vonMonat: number, bisJahr: number, bisMonat: number) {
  return bisJahr * 12 + bisMonat - (vonJahr * 12 + vonMonat) + 1;
}

export type MietvertragFuerSollIst = {
  beginn: Date | null; // null = unbekannt, wird wie ein beliebig weit zurückliegendes Datum behandelt
  ende: Date | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
  mehrwertsteuer?: number;
};

export type SollZeile = {
  jahr: number;
  monat: number; // 1-12
  faelligAm: Date;
  betrag: number;
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
  const betragProMonat =
    vertrag.kaltmiete + vertrag.nebenkostenVorauszahlung + (vertrag.mehrwertsteuer ?? 0);

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
    zeilen.push({
      jahr,
      monat,
      faelligAm: dritterWerktagDesMonats(jahr, monat - 1),
      betrag: betragProMonat,
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
