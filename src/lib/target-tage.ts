// TARGET-Bankarbeitstage für SEPA-Einzugstermine. Reine Datumsrechnung in UTC (Datumswerte der App liegen als UTC-Mitternacht).

/** Ostersonntag (Gauß), für die TARGET-Feiertage Karfreitag/Ostermontag. */
function ostern(jahr: number): Date {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

/** TARGET-Bankarbeitstag: Mo–Fr außer 1.1., Karfreitag, Ostermontag, 1.5., 25.12., 26.12. */
export function istTargetTag(d: Date): boolean {
  const wochentag = d.getUTCDay();
  if (wochentag === 0 || wochentag === 6) return false;
  const md = `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  if (["1-1", "5-1", "12-25", "12-26"].includes(md)) return false;
  const diff = Math.round((d.getTime() - ostern(d.getUTCFullYear()).getTime()) / 86400000);
  return diff !== -2 && diff !== 1;
}

/** Der n-te TARGET-Bankarbeitstag eines Monats (vertraglicher Fälligkeitstermin: n = 3). */
export function nterTargetTag(jahr: number, monat: number, n: number): Date {
  let zaehler = 0;
  for (let t = 1; ; t++) {
    const d = new Date(Date.UTC(jahr, monat - 1, t));
    if (istTargetTag(d) && ++zaehler === n) return d;
  }
}

/** Anzahl TARGET-Bankarbeitstage nach `von` bis einschließlich `bis` (0, wenn `bis` nicht nach `von` liegt). */
export function targetTageZwischen(von: Date, bis: Date): number {
  let n = 0;
  for (let d = new Date(von.getTime() + 86400000); d <= bis; d = new Date(d.getTime() + 86400000)) {
    if (istTargetTag(d)) n++;
  }
  return n;
}

export const isoDatum = (d: Date) => d.toISOString().slice(0, 10);

/** Heutiges Datum in Deutschland als UTC-Mitternacht. */
export function heuteDeutschland(): Date {
  const teile = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  return new Date(`${teile}T00:00:00Z`);
}

/**
 * Mietmonat, für den als Nächstes eingezogen wird: der laufende Monat, solange sein Einzugstermin (3. Bankarbeitstag)
 * noch in der Zukunft liegt, sonst der nächste.
 */
export function naechsterEinzugsmonat(heute: Date = heuteDeutschland()): { jahr: number; monat: number } {
  const jahr = heute.getUTCFullYear();
  const monat = heute.getUTCMonth() + 1;
  if (heute < nterTargetTag(jahr, monat, 3)) return { jahr, monat };
  return monat === 12 ? { jahr: jahr + 1, monat: 1 } : { jahr, monat: monat + 1 };
}
