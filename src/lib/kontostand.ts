// Simuliert den Kontostand-Verlauf aus allen in der App erfassten Buchungen. Die
// Sparkassen-CSV-Exporte führen selbst keine laufende Saldo-Spalte pro Zeile, daher lässt sich
// der Kontostand nur relativ zu einem manuell gesetzten Anker (siehe Objekt.kontostandAnkerDatum/
// -Betrag) rekonstruieren, nicht absolut.

export type KontostandKategorie = "zahlung" | "kosten" | "mietweiterleitung" | "kaution" | "sonstige";

export type KontostandEintrag = {
  id: string;
  datum: Date;
  // Vorzeichenbehaftet wie eine echte Kontobewegung: positiv = eingehend, negativ = ausgehend.
  betrag: number;
  kategorie: KontostandKategorie;
  beschreibung: string;
};

export type KontostandZeile = KontostandEintrag & { kontostand: number };

/**
 * Läuft alle Einträge chronologisch durch und rechnet ab dem Anker-Betrag vor- und zurück, statt
 * bei 0 zu starten — der Anker ist der einzige real bekannte Punkt, alles andere ist relativ dazu.
 */
export function berechneKontostandVerlauf(
  eintraege: KontostandEintrag[],
  anker: { datum: Date; betrag: number },
): KontostandZeile[] {
  const sortiert = [...eintraege].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  let summeBisAnker = 0;
  for (const e of sortiert) {
    if (e.datum.getTime() <= anker.datum.getTime()) summeBisAnker += e.betrag;
  }
  const offset = anker.betrag - summeBisAnker;

  let laufsumme = 0;
  return sortiert.map((e) => {
    laufsumme += e.betrag;
    return { ...e, kontostand: offset + laufsumme };
  });
}
