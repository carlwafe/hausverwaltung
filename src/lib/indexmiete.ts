/**
 * Hilfen für die Indexmiete (§ 557b BGB). Die Rechenregel steht an einer Stelle, damit die Liste
 * "Mieterhöhung" und das Erhöhungsschreiben dasselbe Referenzdatum, denselben Basisindex
 * und dieselbe neue Miete verwenden.
 */

type Erhoehung = { gueltigAb: Date; kaltmiete: number; indexMonat?: string | null };

/**
 * Letzte Änderung der Kaltmiete (nur Einträge, bei denen sich die Kaltmiete gegenüber dem Vorgänger
 * ändert: reine NK-Anpassungen nach § 560 BGB setzen das Wartejahr laut Vertrag nicht zurück) samt
 * dem dabei zugrunde gelegten Index. `undefined` = noch nie geändert (dann zählt der Mietbeginn).
 */
export function letzteKaltmietenAenderung(
  basisKaltmiete: number,
  erhoehungen: Erhoehung[],
): { gueltigAb: Date; indexMonat: string | null } | undefined {
  const sortiert = [...erhoehungen].sort((a, b) => a.gueltigAb.getTime() - b.gueltigAb.getTime());
  let vorher = basisKaltmiete;
  let letzte: { gueltigAb: Date; indexMonat: string | null } | undefined;
  for (const e of sortiert) {
    if (Math.abs(e.kaltmiete - vorher) > 0.0049) letzte = { gueltigAb: e.gueltigAb, indexMonat: e.indexMonat ?? null };
    vorher = e.kaltmiete;
  }
  return letzte;
}

/**
 * Basisindex-Monat der nächsten Indexerhöhung. Entscheidung (Variante C): der bei der letzten
 * Erhöhung zugrunde gelegte Index (`indexMonat`, falls erfasst), sonst der Monat der letzten
 * Kaltmieten-Änderung bzw. des Mietbeginns selbst ("zum Zeitpunkt des Mietbeginns geltende" Index).
 */
export function basisIndexMonat(
  referenzDatum: Date,
  indexMonat: string | null,
): { jahr: number; monat: number; gespeichert: boolean } {
  const m = indexMonat ? /^(\d{4})-(\d{2})$/.exec(indexMonat) : null;
  if (m) return { jahr: Number(m[1]), monat: Number(m[2]), gespeichert: true };
  return { jahr: referenzDatum.getUTCFullYear(), monat: referenzDatum.getUTCMonth() + 1, gespeichert: false };
}

/**
 * Neue Kaltmiete = Kaltmiete × neuer Index ÷ Basisindex. Entscheidung: standardmäßig auf volle Euro
 * **abgerundet** (zugunsten des Mieters, bleibt sicher innerhalb der Indexänderung; Aufrunden würde
 * über die Indexänderung hinausgehen). `abrunden = false` = auf den Cent genau gerundet. Der kleine
 * Zuschlag verhindert, dass Gleitkomma-Reste einen exakt ganzzahligen Wert um 1 € drücken.
 */
export function neueIndexmiete(kaltmiete: number, basisIndex: number, neuerIndex: number, abrunden = true): number {
  const roh = kaltmiete * (neuerIndex / basisIndex);
  return abrunden ? Math.floor(roh + 1e-9) : Math.round(roh * 100) / 100;
}

/**
 * Zugangsfrist der Erklärung (§ 557b Abs. 3 BGB: die geänderte Miete ist ab dem übernächsten Monat nach
 * Zugang zu zahlen): Soll die Miete ab `gueltigAb` gelten, muss das Schreiben spätestens am Letzten des
 * Monats zugehen, der zwei Monate davor liegt (Gültig ab 01.12. → Zugang bis 31.10.). Lokale Datumsteile,
 * weil „Gültig ab“ und das Briefdatum im Formular lokale Kalenderdaten sind.
 */
export function spaetesterZugang(gueltigAb: Date): Date {
  return new Date(gueltigAb.getFullYear(), gueltigAb.getMonth() - 1, 0);
}

/** Umgekehrt: frühester Monatserster, ab dem die Miete gilt, wenn das Schreiben am `zugang` zugeht (übernächster Monat). */
export function fruehestensGueltigNachZugang(zugang: Date): Date {
  return new Date(zugang.getFullYear(), zugang.getMonth() + 2, 1);
}

/**
 * Wartejahr (§ 557b Abs. 2 BGB): Die Miete muss seit der letzten Änderung der Kaltmiete bzw. dem Mietbeginn
 * mindestens ein Jahr unverändert gewesen sein. `true`, wenn `gueltigAb` im Monat der Jahresfrist oder
 * später liegt. Lokale Datumsteile bei `gueltigAb` (Formularwert), UTC beim gespeicherten Referenzdatum.
 */
export function wartejahrErfuellt(referenzDatum: Date, gueltigAb: Date): boolean {
  const fruehestens = new Date(referenzDatum.getUTCFullYear() + 1, referenzDatum.getUTCMonth(), 1);
  return gueltigAb >= fruehestens;
}
