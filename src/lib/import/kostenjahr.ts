// Vorschlag fürs Kostenjahr (Buchung.jahr, nur für die Nebenkostenabrechnung relevant) einer
// importierten Kostenposition. Standard ist das Jahr der Abbuchung; nur bei einem klaren Hinweis
// auf eine Vorjahres-Abrechnung wird das Vorjahr vorgeschlagen, z.B. "NW 2024" (Niederschlagswasser-
// Bescheid, abgebucht im März 2025), "Wartung Rauchwarnmelder 2022" oder "Hausmeister 12/2025"
// (abgebucht im Januar 2026). Bewusst nur das direkte Vorjahr: ältere Jahreszahlen sind meist
// Bezüge wie "offene Miete aus 2023", keine Leistungszeiträume.

// Jahreszahl als Teil einer Rechnungs-/Belegnummer ("Rechnung Nr. 11/2023", "Dauerrechnung
// Nr. 01/2024") ist kein Leistungszeitraum.
const NUMMER_VOR_JAHR = /(?:\bNr\.?|\bNummer|\bRe\.?-?Nr\.?)\s*:?\s*(?:\d{1,4}\s*[/-]\s*)?$/i;

// Jahresabrechnung eines Versorgers mit Rechnungsnummer statt Abschlag (Stadtwerke Lübeck:
// "Breslauer Strasse 9 RNr. 3105463137 209,89 naechste Abb. …") — wird im ersten Halbjahr für das
// Vorjahr abgebucht, trägt aber selbst keine Jahreszahl.
const VERSORGER_JAHRESABRECHNUNG = /\bRNr\.?\s*\d{6,}/i;

export function ermittleKostenjahrVorschlag(verwendungszweck: string | null, datum: string | null): number | null {
  if (!datum) return null;
  const buchungsjahr = Number(datum.slice(0, 4));
  if (!Number.isFinite(buchungsjahr)) return null;
  const text = verwendungszweck ?? "";
  const vorjahr = buchungsjahr - 1;

  for (const treffer of text.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)) {
    if (Number(treffer[1]) !== vorjahr) continue;
    if (NUMMER_VOR_JAHR.test(text.slice(0, treffer.index))) continue;
    return vorjahr;
  }

  const monat = Number(datum.slice(5, 7));
  if (monat <= 6 && VERSORGER_JAHRESABRECHNUNG.test(text) && !/abschlag/i.test(text)) return vorjahr;

  return buchungsjahr;
}
