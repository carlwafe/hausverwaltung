// Teilt vereinnahmte Mietzahlungen in Kaltmiete und Nebenkosten-Vorauszahlung (für die Aufstellung
// Anlage V). Gleiche Regel wie in der Nebenkostenabrechnung (§ 366 Abs. 2 BGB): je Mietmonat wird eine
// Zahlung zuerst auf die NK-Vorauszahlung angerechnet (höchstens das NK-Soll des Monats), der Rest ist
// Kaltmiete. Gerechnet wird je Mietvertrag und Mietperiode laufend in der Reihenfolge der Zahlungen —
// eine Rücklastschrift oder Rückerstattung (negativer Betrag) nimmt zuerst den Kaltmiete-Anteil zurück.
// Dem Jahr zugeordnet wird die Zahlung nach dem Zuflussprinzip inkl. 10-Tage-Regel (siehe
// zuflussJahrMiete); die Aufteilung folgt dagegen der Mietperiode: eine im Januar gezahlte Dezembermiete
// zählt für den Januar, ihr NK-Anteil richtet sich nach dem Dezember.

export type MietzahlungFuerAufteilung = {
  mietvertragId: string | null;
  datum: Date;
  // Reihenfolge bei gleichem Datum (z.B. Erfassungszeitpunkt).
  reihenfolge: number;
  betrag: number;
  periodeJahr: number;
  periodeMonat: number; // 1–12
};

// 10-Tage-Regel (§ 11 Abs. 1 Satz 2 EStG): Regelmäßig wiederkehrende Einnahmen, die kurze Zeit (bis
// 10 Tage) vor Beginn des Jahres zufließen, zu dem sie wirtschaftlich gehören, gelten in diesem Jahr als
// bezogen — Voraussetzung ist, dass auch die Fälligkeit im Zeitraum 22.12.–10.1. liegt. Für die Miete
// heißt das: Die im Voraus gezahlte Januarmiete, die ab dem 22.12. eingeht (fällig am 3. Werktag im
// Januar), zählt zum neuen Jahr. Die Gegenrichtung gibt es nicht: Eine im Januar gezahlte Dezembermiete
// war schon im Dezember fällig, also außerhalb des Zeitraums, und zählt nach dem Zahlungsdatum.
export const ZEHN_TAGE_AB_TAG = 22;

export function zuflussJahrMiete(z: Pick<MietzahlungFuerAufteilung, "datum" | "periodeJahr" | "periodeMonat">): number {
  const jahr = z.datum.getFullYear();
  const imFenster = z.datum.getMonth() === 11 && z.datum.getDate() >= ZEHN_TAGE_AB_TAG;
  if (imFenster && z.periodeJahr === jahr + 1 && z.periodeMonat === 1) return jahr + 1;
  return jahr;
}

export type MietAufteilung = {
  kaltmiete: number;
  nebenkosten: number;
  // Zahlungen, die nach der 10-Tage-Regel zum Berichtsjahr zählen, obwohl sie im Vorjahr eingingen,
  // bzw. die im Berichtsjahr eingingen, aber zum Folgejahr zählen.
  abgrenzung: { hinzu: number; anzahlHinzu: number; heraus: number; anzahlHeraus: number };
};

export function teileMietzahlungen(
  zahlungen: MietzahlungFuerAufteilung[],
  nkSollFuerMonat: (mietvertragId: string, jahr: number, monat: number) => number,
  berichtsjahr: number,
): MietAufteilung {
  const nachPeriode = new Map<string, MietzahlungFuerAufteilung[]>();
  for (const z of zahlungen) {
    const key = `${z.mietvertragId ?? ""}|${z.periodeJahr}|${z.periodeMonat}`;
    const liste = nachPeriode.get(key) ?? [];
    liste.push(z);
    nachPeriode.set(key, liste);
  }

  let kaltmiete = 0;
  let nebenkosten = 0;
  const abgrenzung = { hinzu: 0, anzahlHinzu: 0, heraus: 0, anzahlHeraus: 0 };
  for (const liste of nachPeriode.values()) {
    liste.sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.reihenfolge - b.reihenfolge);
    const { mietvertragId, periodeJahr, periodeMonat } = liste[0];
    // Ohne Mietvertrag lässt sich kein NK-Soll bestimmen — alles zählt als Kaltmiete.
    const nkSoll = mietvertragId ? Math.max(nkSollFuerMonat(mietvertragId, periodeJahr, periodeMonat), 0) : 0;
    let summe = 0;
    let nkBisher = 0;
    for (const z of liste) {
      summe += z.betrag;
      const nkKumuliert = Math.min(Math.max(summe, 0), nkSoll);
      const nkAnteil = nkKumuliert - nkBisher;
      nkBisher = nkKumuliert;

      const zufluss = zuflussJahrMiete(z);
      const datumsJahr = z.datum.getFullYear();
      if (zufluss === berichtsjahr && datumsJahr < berichtsjahr) {
        abgrenzung.hinzu += z.betrag;
        abgrenzung.anzahlHinzu++;
      } else if (zufluss !== berichtsjahr && datumsJahr === berichtsjahr) {
        abgrenzung.heraus += z.betrag;
        abgrenzung.anzahlHeraus++;
      }
      if (zufluss !== berichtsjahr) continue;
      nebenkosten += nkAnteil;
      kaltmiete += z.betrag - nkAnteil;
    }
  }
  return { kaltmiete, nebenkosten, abgrenzung };
}
