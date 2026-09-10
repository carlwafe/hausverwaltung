// Der beim Auszug einbehaltene Betrag ist nicht gespeichert, sondern ergibt sich aus dem
// Vergleich zweier unabhängig erfassbarer Ereignisse: der Auflösung des Kautionskontos
// (aufloesungsbetrag, meist = betrag) und der tatsächlichen Auszahlung an den Mieter
// (rueckzahlungsbetrag). Ohne separate Auflösung (z.B. Kaution war nie auf einem eigenen Konto)
// fällt aufloesungsbetrag auf betrag zurück.
export function berechneEinbehalten({
  betrag,
  aufloesungsbetrag,
  rueckzahlungsbetrag,
}: {
  betrag: number;
  aufloesungsbetrag: number | null;
  rueckzahlungsbetrag: number | null;
}): number | null {
  if (rueckzahlungsbetrag === null) return null;
  return Math.round(((aufloesungsbetrag ?? betrag) - rueckzahlungsbetrag) * 100) / 100;
}

// Der effektiv (noch) einbehaltene Betrag nach Abzug manuell verrechneter Kostenpositionen
// (z.B. eine Reparatur, die vom einbehaltenen Betrag beim Auszug abgezogen wurde).
export function berechneEffektivEinbehalten(
  einbehalten: number | null,
  verrechneteKosten: number,
): number | null {
  if (einbehalten === null) return null;
  return Math.round((einbehalten - verrechneteKosten) * 100) / 100;
}
