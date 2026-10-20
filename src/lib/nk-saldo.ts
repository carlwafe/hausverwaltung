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
 * `buchhaltungAb` ist der wirksame Stichtag des Vertrags (eigener oder der des Objekts, siehe
 * effektiverStichtag in buchhaltung-stichtag.ts): Hat ein Vertrag einen früheren eigenen Stichtag, gilt die
 * Gegenrechnung auch für Abrechnungen ab diesem Datum.
 * Für manuelle Positionen (`details = null`) nur aufrufen, wenn `hatGegenrechnung` es erlaubt: deren
 * Vorauszahlung ist von Hand eingetragen (Verwalter-Betrag bzw. Platzhalter 0). Bei einer versendeten
 * manuellen Position mit Vorauszahlung > 0 gilt der eingetragene Wert als die angesetzte Vorauszahlung
 * (Entscheidung 20.10.2026: sonst steht die unbezahlte NK-Vorauszahlung im Mietrückstand und zusätzlich in
 * der Nachzahlung gegen den kleineren Betrag).
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

/**
 * Ob eine Abrechnungsposition die Gegenrechnung der unbezahlten NK-Vorauszahlung bekommt (und damit wie eine
 * berechnete Position behandelt wird: zählt erst ab dem Versand der Abrechnung):
 * - berechnete Positionen (`details` gesetzt) immer,
 * - manuelle nur, wenn die Abrechnung versendet ist und die eingetragene Vorauszahlung > 0 ist. Platzhalter
 *   (Vorauszahlung 0) würden sonst das ganze NK-Soll gutschreiben; manuelle Positionen unversendeter
 *   Abrechnungen (Verwalter-Beträge 2021–2024) bleiben unberührt — ihre Vorauszahlung ist die des Verwalters
 *   und passt nicht zum NK-Soll (sonst +100 €/−360 € Gutschrift ohne Grund, sobald jemand „versendet“ setzt:
 *   dann zuerst prüfen, ob die Vorauszahlung der Position der tatsächlich gezahlten entspricht).
 * Vor dem Stichtag des Vertrags ergibt `unbezahlteNkVorauszahlung` ohnehin 0.
 */
export function hatGegenrechnung(position: {
  berechnet: boolean;
  vorauszahlungGesamt: number;
  versendetAm: Date | null;
}): boolean {
  if (position.berechnet) return true;
  return position.versendetAm !== null && position.vorauszahlungGesamt > 0;
}

export type BerechnetePosition = {
  jahr: number;
  zeitraumVon: Date;
  zeitraumBis: Date;
  vorauszahlungGesamt: number;
  // Versanddatum der Abrechnung (Nebenkostenabrechnung.versendetAm); null = noch nicht versendet.
  versendetAm: Date | null;
};

export type Gegenrechnung = { jahr: number; betrag: number; datum: Date };

/**
 * Gegenrechnung je Abrechnung (nur Beträge ≠ 0) für die Positionen eines Vertrags, die sie bekommen (`hatGegenrechnung`), jeweils mit
 * dem Datum, ab dem sie gilt: dem Versanddatum der Abrechnung. Nicht versendete Abrechnungen haben keine.
 *
 * Sie gehört zum Mietsaldo: Die unbezahlte NK-Vorauszahlung steht dort als Rückstand, ist aber erst mit der
 * Abrechnung nicht mehr geschuldet (die Abrechnung vergleicht die Kosten nur mit der gezahlten
 * Vorauszahlung) — davor besteht der Rückstand tatsächlich. Deshalb zählt sie ab dem Versanddatum
 * (`gegenrechnungBis`), nicht schon ab Jahresanfang; gespeichert wird nichts, der Wert ändert sich mit
 * „Neu berechnen“ und den Zahlungen.
 */
export function gegenrechnungenJeJahr(
  vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">,
  positionen: BerechnetePosition[],
  buchhaltungAb: Date | null,
): Gegenrechnung[] {
  const liste: Gegenrechnung[] = [];
  for (const p of positionen) {
    if (!p.versendetAm) continue;
    const betrag = unbezahlteNkVorauszahlung(vertrag, p, buchhaltungAb);
    if (betrag !== 0) liste.push({ jahr: p.jahr, betrag, datum: p.versendetAm });
  }
  return liste.sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.jahr - b.jahr);
}

/** Summe der Gegenrechnungen, die am Stichtag schon gelten (Versanddatum ≤ Stichtag), cent-genau. */
export function gegenrechnungBis(liste: { betrag: number; datum: Date }[], stichtag: Date): number {
  const summe = liste.filter((g) => g.datum <= stichtag).reduce((s, g) => s + g.betrag, 0);
  return Math.round(summe * 100) / 100 || 0;
}
