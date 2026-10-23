// NK-Anteil einer Mietzahlung (Teilzahlung): gemeinsame Regel der Nebenkostenabrechnung
// (Vorauszahlung) und der Aufstellung für die Steuererklärung (Mieten/Nebenkosten).
//
// Bis einschließlich Mietjahr 2024: zuerst auf die NK-Vorauszahlung bis zum NK-Soll, erst der Rest auf
// die Kaltmiete. Ab Mietjahr 2025 (Entscheidung 23.10.2026): anteilig im Verhältnis der Beträge
// (§ 366 Abs. 2 BGB: verhältnismäßig), der NK-Anteil auf volle Euro gerundet und höchstens das NK-Soll.
// Zahlt der Mieter mindestens das Soll des Monats, gilt in beiden Fällen der volle NK-Betrag.
export const ANTEILIG_AB_JAHR = 2025;

/**
 * NK-Anteil einer (kumulierten, ggf. mehrfachen) Zahlung für einen Mietmonat.
 * @param summe     gezahlt für diesen Monat (ohne Umsatzsteuer)
 * @param nkSoll    NK-Soll des Monats
 * @param sollGesamt Kaltmiete + NK-Soll des Monats (ohne Umsatzsteuer)
 * @param mietjahr  Jahr der Mietperiode
 */
export function nkAnteilEinerZahlung(summe: number, nkSoll: number, sollGesamt: number, mietjahr: number): number {
  const gezahlt = Math.max(summe, 0);
  if (mietjahr < ANTEILIG_AB_JAHR) return Math.min(gezahlt, nkSoll);
  if (gezahlt <= 0 || sollGesamt <= 0 || nkSoll <= 0) return 0;
  if (gezahlt >= sollGesamt) return nkSoll;
  return Math.min(nkSoll, Math.round((gezahlt * nkSoll) / sollGesamt));
}
