// Ordnet eine Darlehensabbuchung im Kontoauszug einem Darlehen der Stammdaten zu: Die Darlehensnummer steht im
// Verwendungszweck („Baufinanzierung 730 8080822 96 …“) oder, bei einer Überweisung ohne Text, als Kontonummer im
// IBAN des Empfängerkontos (…0808082296). Nur ein eindeutiger Treffer zählt. Reine Funktion ohne Datenbank, damit
// auch Client-Komponenten sie nutzen können.

export type DarlehenErkennungsDaten = { id: string; darlehensnummer: string | null };

const ziffern = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

/**
 * Das Darlehen, dessen Nummer in Verwendungszweck oder IBAN der Gegenseite vorkommt. Bei der IBAN genügen die letzten
 * 9 Ziffern der Darlehensnummer (die Bank setzt die Kontonummer ohne Filialkennung ein). Keine oder mehrere Treffer →
 * null (dann von Hand wählen).
 */
export function erkenneDarlehen(
  darlehen: DarlehenErkennungsDaten[],
  verwendungszweck: string | null | undefined,
  iban: string | null | undefined,
): string | null {
  const zweck = ziffern(verwendungszweck);
  const ibanZiffern = ziffern(iban);
  const treffer = darlehen.filter((d) => {
    const nr = ziffern(d.darlehensnummer);
    if (nr.length < 6) return false;
    if (zweck.includes(nr)) return true;
    const kurz = nr.slice(-9);
    return kurz.length >= 8 && ibanZiffern.endsWith(kurz);
  });
  return treffer.length === 1 ? treffer[0].id : null;
}
