// Restsaldo einer Nebenkostenabrechnung nach Auszahlung/Verrechnung: Cent-genau gerundet, und ein Rest
// von höchstens 1 Cent gilt als erledigt (Rundungsdifferenzen, z.B. durch den Restcent-Ausgleich oder
// krumme Überweisungen) und wird auf 0 gesetzt.
export function saldoMitToleranz(saldo: number): number {
  const gerundet = Math.round(saldo * 100) / 100;
  return Math.abs(gerundet) <= 0.01 ? 0 : gerundet;
}
