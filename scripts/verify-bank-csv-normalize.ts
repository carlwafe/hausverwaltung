// Regression check for normalizeText()/findColumn() umlaut handling (src/lib/import/bank-csv.ts).
// Run with: npx tsx scripts/verify-bank-csv-normalize.ts
import { findColumn, KONTOAUSZUG_SPALTEN, normalizeText } from "../src/lib/import/bank-csv";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`OK: ${label}`);
}

assertEqual(normalizeText("Auftraggeber/Empfänger"), "auftraggeberempfaenger", "ä -> ae");
assertEqual(
  normalizeText("Begünstigter/Zahlungspflichtiger"),
  "beguenstigterzahlungspflichtiger",
  "ü -> ue",
);
assertEqual(normalizeText("Straße"), "strasse", "ß -> ss still works");
assertEqual(normalizeText("Größe"), "groesse", "ö -> oe");

const headers = ["Buchungstag", "Auftraggeber/Empfänger", "Verwendungszweck", "Betrag"];
assertEqual(
  findColumn(headers, [...KONTOAUSZUG_SPALTEN.name]),
  "Auftraggeber/Empfänger",
  "findColumn matches real umlaut header against ASCII-transliterated candidate",
);

console.log("All checks passed.");
