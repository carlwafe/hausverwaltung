// Teilt vereinnahmte Mietzahlungen in Kaltmiete und Nebenkosten-Vorauszahlung (für die Aufstellung
// Anlage V). Gleiche Regel wie in der Nebenkostenabrechnung (§ 366 Abs. 2 BGB): je Mietmonat wird eine
// Zahlung zuerst auf die NK-Vorauszahlung angerechnet (höchstens das NK-Soll des Monats), der Rest ist
// Kaltmiete. Gerechnet wird je Mietvertrag und Mietperiode laufend in der Reihenfolge der Zahlungen —
// eine Rücklastschrift oder Rückerstattung (negativer Betrag) nimmt zuerst den Kaltmiete-Anteil zurück.
// Zugeordnet wird die Zahlung dem Zeitraum ihres Zahlungsdatums (Zuflussprinzip), die Aufteilung
// folgt aber der Mietperiode: eine im Januar gezahlte Dezembermiete zählt für den Januar, ihr
// NK-Anteil richtet sich nach dem Dezember.

export type MietzahlungFuerAufteilung = {
  mietvertragId: string | null;
  datum: Date;
  // Reihenfolge bei gleichem Datum (z.B. Erfassungszeitpunkt).
  reihenfolge: number;
  betrag: number;
  periodeJahr: number;
  periodeMonat: number; // 1–12
};

export function teileMietzahlungen(
  zahlungen: MietzahlungFuerAufteilung[],
  nkSollFuerMonat: (mietvertragId: string, jahr: number, monat: number) => number,
  imZeitraum: (datum: Date) => boolean,
): { kaltmiete: number; nebenkosten: number } {
  const nachPeriode = new Map<string, MietzahlungFuerAufteilung[]>();
  for (const z of zahlungen) {
    const key = `${z.mietvertragId ?? ""}|${z.periodeJahr}|${z.periodeMonat}`;
    const liste = nachPeriode.get(key) ?? [];
    liste.push(z);
    nachPeriode.set(key, liste);
  }

  let kaltmiete = 0;
  let nebenkosten = 0;
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
      if (!imZeitraum(z.datum)) continue;
      nebenkosten += nkAnteil;
      kaltmiete += z.betrag - nkAnteil;
    }
  }
  return { kaltmiete, nebenkosten };
}
