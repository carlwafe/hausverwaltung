import { ermittleMieteFuerMonat, type MietvertragFuerSollIst } from "./soll-ist";

// Restsaldo einer Nebenkostenabrechnung nach Auszahlung/Verrechnung: Cent-genau gerundet, und ein Rest
// von höchstens 1 Cent gilt als erledigt (Rundungsdifferenzen, z.B. durch den Restcent-Ausgleich oder
// krumme Überweisungen) und wird auf 0 gesetzt.
export function saldoMitToleranz(saldo: number): number {
  const gerundet = Math.round(saldo * 100) / 100;
  return Math.abs(gerundet) <= 0.01 ? 0 : gerundet;
}

const monatsIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/**
 * Unbezahlter Teil der NK-Vorauszahlung einer *berechneten* Abrechnungsposition: das NK-Soll, das im
 * Mietsaldo steht (volle Monate wie `sollAufschluesselung`), minus die in der Abrechnung als gezahlt
 * angesetzte Vorauszahlung (`vorauszahlungGesamt`, nur tatsächlich gezahlte NK, § 366 Abs. 2 BGB).
 *
 * Wozu: Die Abrechnung vergleicht die Kosten mit der *gezahlten* Vorauszahlung. Die unbezahlte
 * Vorauszahlung steht aber weiter als Rückstand im Mietsaldo — ohne Gegenrechnung würde sie dort und
 * in der Nachzahlung doppelt belastet (Beispiel: Kosten 2.790,95 €, NK-Soll 3.360 €, gezahlt 2.520 €:
 * Nachzahlung 270,95 € + Rückstand 840 € = 1.110,95 € statt 270,95 €). Die Abrechnung ersetzt das
 * NK-Soll im Mietsaldo durch die Kosten, ihre Wirkung auf den Saldo ist also
 * `saldo + unbezahlteNkVorauszahlung` (= NK-Soll − Kosten); so bucht es auch der Verwalter.
 *
 * Keine Gegenrechnung (0) vor Buchhaltungsbeginn — dort stehen weder Soll noch Zahlungen im Mietsaldo.
 * Für manuelle Positionen (`details = null`) nicht aufrufen: deren Vorauszahlung ist von Hand
 * eingetragen (Verwalter-Betrag bzw. Platzhalter 0) und hat keine Beziehung zu den Zahlungen.
 */
export function unbezahlteNkVorauszahlung(
  vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">,
  position: { zeitraumVon: Date; zeitraumBis: Date; vorauszahlungGesamt: number },
  buchhaltungAb: Date | null,
): number {
  const von = monatsIndex(position.zeitraumVon);
  const bis = monatsIndex(position.zeitraumBis);
  if (buchhaltungAb && von < monatsIndex(buchhaltungAb)) return 0;
  let soll = 0;
  for (let i = von; i <= bis; i++) {
    soll += ermittleMieteFuerMonat(vertrag, Math.floor(i / 12), (i % 12) + 1).nebenkostenVorauszahlung;
  }
  return Math.round((soll - position.vorauszahlungGesamt) * 100) / 100;
}
