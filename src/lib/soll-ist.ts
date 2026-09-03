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
 */
export function berechneSoll(vertrag: MietvertragFuerSollIst, heute: Date = new Date()): number {
  const referenz = vertrag.ende && vertrag.ende < heute ? vertrag.ende : heute;

  const monate = monateInklusive(
    vertrag.beginn.getFullYear(),
    vertrag.beginn.getMonth() + 1,
    referenz.getFullYear(),
    referenz.getMonth() + 1,
  );

  if (monate <= 0) return 0;
  return monate * (vertrag.kaltmiete + vertrag.nebenkostenVorauszahlung);
}
