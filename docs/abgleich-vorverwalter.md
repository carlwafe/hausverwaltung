# Abgleich mit dem Vorverwalter (Altdaten, Berichte)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Altdaten vor dem Buchhaltungsbeginn

Kautionen und Mietbeginn/-ende vor dem Buchhaltungsbeginn stammen aus den E-A-Aufstellungen des Vorverwalters (iCloud-Ordner "Eutin/E:A Austellung"):

- Konto 3500 = Kautionsverbindlichkeiten (Einzahlung/Anlage/Auflösung/Einbehalt).
- Mieterzeilen = Jahresmiete je Mieter (→ Monate → Ein-/Auszug).
- Die Kautionskonto-Nummer 06**JJ**… verrät das Eröffnungsjahr.
- Ohne Beleg keinen Kaution-Datensatz mit geratenem Betrag anlegen.
- Die Kontonummern dort nicht als Sachkonten übernehmen (siehe `docs/berichte-steuer.md` → „Kontenrahmen“).

## PowerHaus-PDFs in CSV umwandeln

Die Berichte (Quartals-/Jahresberichte, E-A-Aufstellungen) sind schwer lesbar — Mieterzeilen über 2–4 Zeilen, Buchstaben einzeln gesetzt, Texte abgeschnitten, Spalten nur über die Position erkennbar. Deshalb werden sie in CSV umgewandelt. Die Skripte liegen nicht im Git, nur im Hauptordner unter `scripts-tmp/`.

- **Umwandeln:** `scripts-tmp/ea-pdf-zu-csv.py "<bericht>.pdf" <zielordner> "<präfix>"` (braucht `pdftotext`) erzeugt „… - Mieter.csv“ (eine Zeile je Mieter), „… - Buchungen.csv“ und „… - Übersicht.csv“. Format: Semikolon, Dezimalkomma ohne Tausenderpunkt, UTF-8 mit BOM, Datum ISO.
- **Eingebaute Kontrollen** (Exitcode 1 bei jeder Abweichung, Dateien dann nicht verwenden): Spaltensummen gegen Ges.Summe, Saldoprobe je Mieter (Saldo neu = Saldo alt + Einnahmen − Forderungen), Konto- und Bereichssummen, Rechenproben über die Übersicht.
- **Gegenprobe:** `scripts-tmp/ea-pdf-verify.py "<bericht>.pdf" "<csv-pfad ohne ' - Mieter.csv'>"` liest das PDF unabhängig per `pdftotext -layout` und vergleicht alle Beträge, Namen und Buchungen — nach jeder Konvertierung laufen lassen. Nach Änderungen am Skript müssen die vorhandenen CSVs byte-identisch reproduzierbar bleiben.
- **Ältere Berichte (2015–2019, „Einnahmen/Ausgaben-Aufstellung (Euro)“)** haben keine Mieter-Tabelle mit Soll und Salden, nur Einnahmen je Mieter nach Zahlungseingang: eigenes Skript `scripts-tmp/ea-aufstellung-zu-csv.py` (gleicher Aufruf, gleiche Dateinamen und Kontrollen) und Gegenprobe `scripts-tmp/ea-aufstellung-verify.py`. 2019 hat nur Brutto, 2015–2018 Netto/MwSt/Brutto (CSV-„Betrag“ = Netto); 2015 hat vier Abgrenzungsabschnitte (CSV-Spalte „Abschnitt“).
- **Ablage:** Die CSVs liegen im Unterordner „Berichte in CSV Format“ des iCloud-Ordners „Eutin/E:A Austellung“ (2015–2025, Q1–Q3 2026), die PDFs darüber.

Stolperfallen der PDFs:
- PowerHaus druckt je Mieter bis zu vier Zeilen (Forderung, Forderung MwSt, Einnahme, Einnahme MwSt) und lässt leere weg — ein Block mit zwei Zeilen kann Forderung + Forderung MwSt sein (entscheidet die Saldoprobe).
- PowerHaus 26.90 setzt die Buchungsseiten anders (Netto/Brutto, Dublettenzeile, Kontosumme und Steuerzeile in eigenen Zeilen); das Skript kennt beide Formate.
- Die Periodenzuordnung wechselt je Bericht (Q1/Q3 2026 und 2024 „nach Geltungsmonat“, Q2 2026 und 2025 „nach Belegdatum“) — erklärt Zeitdifferenzen beim Abgleich.
- 2016 bricht Buchungstexte mitten im Wort um („Ausg leich“; nicht rekonstruiert). Im Original abgeschnittene Texte („…“) lassen sich nicht rekonstruieren.
- Der Bankstand zum Jahresende ist der Vorsaldo des Folgejahres (Plausibilitätscheck). Bankstände weichen teils vom berechneten Gesamtergebnis ab (z.B. 2017–2019, so im Original).

## Mieter: App-Quartals-/Jahresübersicht ↔ PDF

- **App-Werte:** `scripts-tmp/quartal-app.ts <jahr> <quartal 0–4> <datei.json>` = `berechneMieterBericht` gegen die Produktions-DB, nur lesend (Quartal 0 = Gesamtjahr). Spiegelt `ladeMieterZeilen` in `bericht-seite.tsx` (inkl. Stichtag je Vertrag, `STICHTAG_TEST`) und muss bei Änderungen dort nachgezogen werden.
- **Vergleich:** `scripts-tmp/ea-vergleich-app.py "<… - Mieter.csv>" <app.json> "<… - Vergleich App.csv>"` (Diff = App − PDF, nur lesend).
- Werte im Mieter-PDF sind Quartals- bzw. Jahressummen, Vorzeichen wie in der App (negativ = Mieter schuldet). Die Mieternummer ist laufende Nummer + Zähler, **nicht** die Wohnungsnummer, „WHG …“ ist abgeschnitten — zugeordnet wird über Haus bzw. Garage + Nachname.

**Erwartete Differenzen (kein Fehler):**
- Zahlungen zählt das PDF nach Zahlungsdatum, die App nach Mietperiode (im Folgequartal ausgeglichen).
- Die NK-Abrechnung blendet die App in Q1/Q2 aus, das PDF führt Guthaben/Nachzahlung in Saldo alt/neu.
- **Januar-Abgrenzung auf Konto 9600 — zuerst ausschließen:** Zahlt ein Mieter im Dezember schon die Januarmiete, bucht der Vorverwalter sie auf 9600 „Überzahlung HG/Miete“ (Text „Miete + NK 01/…“) und führt diesen Januar im Folgejahr weder als Soll noch als Einnahme — das Jahr zeigt 11 statt 12 Monate Soll, ohne Rückstand. Belegt für 2023–2025. Wiederkehrende Fälle (mehrere Mieter eines Hauses mit gleichem Betrag Jahr für Jahr, z.B. 11 × 292 €) sind fast immer dieser Mechanismus. Prüfung: im Buchungen-CSV des Vorjahres nach `;9600;` und der Mieternummer suchen. Beide Rechnungen enden gleich (Saldo alt des Folgejahres). Steuerliche Folge siehe `docs/berichte-steuer.md` → „10-Tage-Regel“.

**Echte Verwalterfehler (die App nicht angleichen):**
- Ein Monat Soll fehlt trotz voller Zahlung und ohne 9600-Eintrag, oder Neumieter mit Beginn im Vorjahr haben nur 10–11 Monate Soll — die App ist vertragsgemäß richtig.
- Kürzt er das Soll auf die tatsächlich gezahlten Monate, bleibt der unbezahlte Monat in der App als Rückstand offen: unter „Offene Posten“ prüfen, ob ein Verzicht vereinbart war.
- **Fehlende Sollstellung:** Fehlt dort die Sollstellung eines Monats, zeigt sein Mieterkonto ein Plus, obwohl nichts gezahlt wurde (ein Fall in Q4 2025, vom Vorverwalter bestätigt und korrigiert). Die Miete ist geschuldet; gefordert wird nur die Kaltmiete, weil die NK-Abrechnung die tatsächlich gezahlte Vorauszahlung ansetzt (Gegenrechnung, siehe `docs/nebenkosten.md`). Beim Prüfen zuerst die Mietzahlungen je Mietperiode ansehen: Eine Periode ohne Zahlung ist der Rückstand.
- Differenzen im Saldo alt (z.B. genau eine Monatsmiete): fehlende Zahlungen im Journal oder abweichenden Saldovortrag prüfen.

Dasselbe Muster gilt beim Abgleich der Jahres-Kaltmieten (siehe `docs/schreiben-mieter.md` → „Abgleich der Stufen mit dem Verwalter“).

## Kosten ↔ Verwalterberichte

Leseskripte `scripts-tmp/kosten-vs-verwalter.ts` (Q1/Q2 2026) und `kosten-q3.ts` (Q3), nur lesend. Die CSV-Pfade darin sind fest eincodiert und zeigen noch auf den alten Ort neben den PDFs — vor dem Lauf auf „Berichte in CSV Format“ umstellen.

Vorgehen: Kostenpositionen nach Datum + Betrag zuordnen, übrig bleiben Verwalter-only und App-only; zusätzlich Summen je Konto/Kostenart und je Quartal vergleichen — die Differenz muss sich vollständig erklären lassen.

**Erwartete Unterschiede:** Rücklastschrift-Bankgebühren (App: Kosten „Nebenkosten des Geldverkehrs“, Verwalter: Abzug bei den Mietern), Waschgeld (Verwalter nettet Einnahme mit Entnahme), Mahngebühr (Verwalter: Einnahme auf 8000), Stadtwerke (Verwalter: je Wasser/Abwasser eine Zeile, App: ein Saldo je Haus), Grundsteuer-Rate je nach Aufteilung, Kautionsverrechnungen (Verwalter-intern ohne Bankumsatz).

**Echte Verwalterfehler bisher:** Gasrechnung auf 3500 statt 4286, falsche Hausnummern/Wohnungen im Buchungstext, Stromrechnung als Leerstand statt Allgemeinstrom bzw. umgekehrt — im Zweifel gilt der Bankverwendungszweck bzw. die Rechnung. Doppelt gezahlte Rechnungen stehen auch im Verwalterbericht doppelt.
