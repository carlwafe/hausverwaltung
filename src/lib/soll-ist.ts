export function monateInklusive(vonJahr: number, vonMonat: number, bisJahr: number, bisMonat: number) {
  return bisJahr * 12 + bisMonat - (vonJahr * 12 + vonMonat) + 1;
}

export type MietvertragFuerSollIst = {
  beginn: Date;
  ende: Date | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
};

/**
 * Soll = Anzahl vollständiger Monate seit Mietbeginn (bis heute bzw. bis Mietende, falls
 * dieses in der Vergangenheit liegt) × Warmmiete (Kaltmiete + NK-Vorauszahlung).
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
  const referenz = vertrag.ende && vertrag.ende < heute ? vertrag.ende : heute;
  const start = buchhaltungAb && buchhaltungAb > vertrag.beginn ? buchhaltungAb : vertrag.beginn;

  const monate = monateInklusive(
    start.getFullYear(),
    start.getMonth() + 1,
    referenz.getFullYear(),
    referenz.getMonth() + 1,
  );

  if (monate <= 0) return 0;
  return monate * (vertrag.kaltmiete + vertrag.nebenkostenVorauszahlung);
}

/**
 * Ist = Summe der erfassten Zahlungen — ab `buchhaltungAb`, falls gesetzt, damit Ist und Soll
 * denselben Zeitraum abdecken. Ohne diesen Filter würden ältere Zahlungen (die im Soll seit
 * `buchhaltungAb` gar nicht mehr mitgezählt werden) den Saldo künstlich ins Plus ziehen.
 */
export function berechneIst(
  zahlungen: { datum: Date; betrag: number }[],
  buchhaltungAb: Date | null = null,
): number {
  return zahlungen
    .filter((z) => !buchhaltungAb || z.datum >= buchhaltungAb)
    .reduce((sum, z) => sum + z.betrag, 0);
}
