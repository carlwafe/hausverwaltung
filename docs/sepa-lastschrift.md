# SEPA-Lastschrift der Vermieterin (Mandate, Einzugsdatei)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Gläubigerin und bestehende Mandate

Die Mieten werden per SEPA-Core-Lastschrift eingezogen, und **die Gläubiger-ID gehört der Vermieterin selbst, nicht dem Vorverwalter** (im Journal bestätigt: fast alle Mietzahlungen mit Mandat laufen unter dieser ID; alle aktiven Lastschrift-Verträge haben eine Mandatsreferenz in den Bankzeilen, manche mehr als eine). Gläubigerin = Vermieterin = Inhaberin des Mietkontos; der Eigentümer ist nur Kontobevollmächtigter und reicht die Dateien ein — eine eigene Gläubiger-ID des Bevollmächtigten wird nicht gebraucht (verworfen: getrennter „Zahlungsempfänger“ mit dessen ID).

- **Bestehende Mandate bleiben gültig**, solange Gläubiger-ID, Mandatsreferenz und Gläubiger-Kontoverbindung unverändert bleiben (sonst Änderung mit der Vorabankündigung mitteilen). Ein Mandat verfällt nach 36 Monaten ohne Einzug.
- Gläubigerdaten (Name, Anschrift, Gläubiger-ID) stehen bewusst **nicht im Quelltext**, sondern am `Objekt` (`sepaGlaeubigerName`, `sepaGlaeubigerAnschrift`, `sepaGlaeubigerId`), gepflegt unter „Objekt“ → „SEPA-Lastschrift (Mandate)“ (nur Admin; ID mit Mod-97-Prüfziffer geprüft, `glaeubigerIdGueltig`, ohne Leerzeichen in Großschreibung gespeichert).

**Offen (wartet auf Externe):**
1. Mandatsunterlagen (Unterschrift, Datum) beim Vorverwalter anfordern — Nachweis bei Widerspruch.
2. Bank: Vollmacht des Vorverwalters löschen, die des Bevollmächtigten einrichten; bestätigen lassen, dass er unter der bestehenden Lastschriftvereinbarung und ID der Vermieterin einreichen darf, mit Format, Einreichungsfrist und Limit.
3. Kein Doppeleinzug: Solange der Vorverwalter noch einzieht, keine eigene Datei einreichen und nichts an die Mieter schicken, was die Einzüge ändert.

## Mandate am Mietvertrag

Spalten `Mietvertrag.mandatReferenz`, `mandatGlaeubigerId`, `mandatDatum` (Unterschrift), `mandatKontoinhaber`, `mandatIban` (alle optional). Anzeige im Block „SEPA-Lastschriftmandat“ der Vertragsdaten (bei Lastschrift ohne Mandat ein Hinweis), Pflege in „Mietvertrag bearbeiten“ (Gläubiger-ID und IBAN mit Prüfziffer geprüft).

- **Übernahme aus dem Journal:** `mandatDetailsAusEinzug` (`src/lib/lastschrift-mandat.ts`) liest nur echte Einzüge (bei Rückbelastungen steht in der IBAN-Spalte das eigene Konto); Zahler-IBAN = „Kontonummer/IBAN“, Kontoinhaber = „Begünstigter/Zahlungspflichtiger“. Bestand per Einmalskript `scripts-tmp/mandate-uebernehmen.ts [--write]` übernommen (überschreibt nichts; bei mehreren Referenzen die des jüngsten Einzugs — die Endung „-1“ steht für ein später neu erteiltes Mandat).
- **Neue Lastschrift-Mieter:** Knopf „Aus Kontoauszug übernehmen“ im Block „SEPA-Lastschriftmandat“ (`holeMandatAusKontoauszug`, `ladeMandatAusKontoauszug`) füllt nur die Formularfelder aus dem jüngsten Einzug; gespeichert wird mit „Speichern“, bei abweichenden Werten fragt das Formular nach. Geht erst nach dem ersten importierten Einzug; fehlt in „Neuer Mietvertrag“.
- **Unterschriftsdatum** steht in keiner Bankzeile. Bei allen übernommenen Mandaten steht ersatzweise der **Mietbeginn** — ein Platzhalter, kein belegtes Datum. Mit den Unterlagen des Vorverwalters das echte Datum eintragen.
- Die Anpassungsschreiben (Vorabankündigung) nehmen Referenz und Gläubiger-ID zuerst vom Vertrag, sonst aus dem Journal (`ladeLastschriftMandat`).

## Seite „Lastschrift-Mandate“ (temporär)

Stammdaten → `/mietvertraege/lastschrift-mandate`, Einzelmandat `/mietvertraege/[id]/lastschrift-mandat`, Sammeldruck `…/drucken?ids=…` (`src/components/mandat-blatt.tsx`, `mandat-seite.tsx`, `src/lib/sepa-mandat.ts`, `mandat-laden.ts`). Für neue Mandate (Überweiser, die umstellen, neue Verträge, geänderte Gläubigerin/Kontoverbindung). Entfällt, sobald Mandate in der App vollständig erfasst und gedruckt werden.

- Je Vertrag ein A4-Mandat mit Mieter und Mietobjekt vorausgefüllt (Kontoinhaber, Bank, IBAN, Datum, Unterschrift füllt der Mieter aus); mehrere Verträge in einem Druck (`break-after: page`, nur über den Druckdialog getestet). **Ausgedruckte Mandate werden nicht gespeichert**; das unterschriebene Mandat als Scan in der Mieterakte ablegen.
- Gläubigerdaten kommen über `ladeGlaeubiger()` vom Objekt, sind für den einzelnen Ausdruck änderbar (nichts gespeichert); Drucken erst, wenn alle drei ausgefüllt sind.
- **Filter „Mandat“** (Standard: ohne Mandat – Mieter zahlt selbst; außerdem ohne Mandat – Jobcenter/Kreis zahlt, mit Mandat, alle). Der Zahler kommt aus den Zahlernamen der Mietzahlungen der letzten 12 Monate (`ladeZahler`: „Bundesagentur“/„Jobcenter“ bzw. „Kreis Ostholstein“; zahlt der Mieter daneben selbst, „Jobcenter + Mieter“, zählt zu den Amt-Zahlern; ohne Zahlung gilt er als Selbstzahler) und wird nur für Verträge ohne Mandat berechnet. Jobcenter-Mieter lassen sich meist nicht einziehen. Bei vorhandenem Mandat ist „Neu erstellen“ gedämpft, die Einzelseite warnt.
- **Mandatsreferenz** für neue Mandate je Einheit vorgeschlagen (`mandatsreferenz()`: Teil der Bezeichnung vor „ - “, nur A–Z/0–9, z.B. „EUT-HS6WHG4-001“, höchstens 35 Zeichen, ohne Personendaten). Bei bestehendem Mandat die vorhandene Referenz beibehalten; bei einem zweiten Mandat derselben Einheit die Endnummer von Hand hochzählen (die App prüft das nicht).
- **Mandatstext:** Ermächtigung + Weisung an die Bank, 8-Wochen-Erstattung (13 Monate bei nicht autorisierten Einzügen), Vorabankündigung auf einen Kalendertag verkürzt (Einzug am 3. Werktag, Betragsänderungen kündigt das Anpassungsschreiben an), Verfall nach 36 Monaten.

## Einzugsdatei pain.008

Sammellastschrift als **pain.008.001.08** (`src/lib/sepa-pain008.ts`: reine Funktionen, Prüfung von IBAN/Referenzen/Längen, SEPA-Zeichensatz, gegen die offizielle XSD geprüft). Erzeugt wird sie bisher mit dem Leseskript `scripts-tmp/pain008-erzeugen.ts --monat JJJJ-MM [--datum JJJJ-MM-TT] [--ohne "HS 2 WHG 3,Garage 2"] [--vergleich JJJJ-MM]` gegen die Produktions-DB (schreibt nichts; eine Seite in der App gibt es noch nicht). Die erste Datei (11/2026) ist erzeugt, aber noch nicht eingereicht.

- **Wer:** ein Einzug je Vertrag mit Zahlungsweg `LASTSCHRIFT`, Status `AKTIV`/`GEPLANT`, Mietbeginn ≤ Monatsende, Vertragsende nicht vor dem Einzugstermin, vollständigem Mandat (Referenz, IBAN mit Prüfziffer, Kontoinhaber) und der Gläubiger-ID des Objekts. Einzelne Verträge mit `--ohne` ausnehmen (z.B. wenn die Lastschrift jeden Monat zurückgegeben wird).
- **Betrag** = Kaltmiete + NK-Vorauszahlung + ggf. Mehrwertsteuer des Monats nach Mieterhöhungen, abzüglich Mietnachlass (`ermittleMieteFuerMonat`). Gegenprobe mit `--vergleich`: Für Oktober 2026 stimmten alle berechneten Beträge mit den eingezogenen überein.
- **Termin** = 3. Bankarbeitstag des Monats (TARGET, wie der vertragliche Fälligkeitstermin); früher geht nicht (Core braucht einen Bankarbeitstag Vorlauf, die Vorabankündigung nennt den 3. Werktag).
- **Sequenz:** alle als Folgelastschrift (RCUR) in einem Sammler (`BtchBookg` true), weil jedes Mandat schon eingezogen wurde; ein Mandat ohne Einzug in 36 Monaten ginge als FRST in einen eigenen Sammler.
- **Unterschriftsdatum:** das am Vertrag erfasste, sonst der Mietbeginn — nur, wenn er nicht nach dem ersten Einzug im Journal oder in der Zukunft liegt (die Bank prüft das Datum nicht; im Streitfall zählt das unterschriebene Mandat).
- **Verwendungszweck:** „Miete+BK MM.JJJJ <Einheit>“ (ohne Namen); die Mieternummer des Vorverwalters steht nicht in der DB.
- **End-to-End-ID** = „MJJMM-“ + Ende der Mandatsreferenz (≤ 35 Zeichen); teilen sich Wohnung und Garage eines Mieters ein Mandat, bekommt der zweite Einzug „-2“ (dieselbe Referenz zweimal am selben Tag ist erlaubt).
- **Abnahme vor dem Einreichen:** gegen die XSD prüfen, Kopfsumme/Anzahl nachrechnen, IBAN und Referenz je Einzug mit dem letzten echten Einzug vergleichen, Beträge mit dem letzten Einzug vergleichen (Abweichung = Mieterhöhung, die angekündigt sein muss), nach Rückbelastungen suchen.
- Der Einzug selbst erzeugt keine Buchung, erst die Bankgutschrift (Import).

**Noch nicht gebaut:** eigene Mandatstabelle mit Status/Historie, Einzugslauf mit Vorschau als Seite, Abgleich der Gutschriften aus dem Import mit dem Einzugslauf.

## Lastschriften im Kontoauszug lesen

- **Mieteinzug:** Buchungstext `EINZELLASTSCHRIFTEINZUG`, positiver Betrag. `FOLGELASTSCHRIFT`/`EINMAL LASTSCHRIFT` mit negativem Betrag sind Abbuchungen von uns (Stadtwerke, Handwerker), `LS RUECKBELASTUNG` eine zurückgegebene Lastschrift.
- Die CSV der Bank ist **Windows-1252**. Mandatsreferenzen des Bestands haben die Form „Breslauer-Str-5-WHG-4“; der Verwendungszweck beginnt mit der Mieternummer des Vorverwalters („2000.4401-09.26 MIETE+BK“).
- Zuordnung nur über den Zahlernamen ist nicht eindeutig (Wohnung + Garage, gleiche Nachnamen im Haus, Schreibvarianten) — zusätzlich die Hausnummer in der Mandatsreferenz nutzen.
- **Größenordnung** (09/2026): Monatslauf am 3. mit gut 50 Einzügen über rund 26.500 €, dazu einzelne Einzüge von Abrechnungsergebnissen Mitte des Monats.
- **Stolperfalle Lastschrift nach Vertragsende:** Ein zum Monatsende beendeter Vertrag wurde im Folgemonat noch eingezogen — beim Vertragsende die Lastschrift sofort stoppen bzw. den Vertrag aus der Einzugsliste nehmen und den Einzug zurückgeben oder verrechnen.
- Leseskripte (nicht im Git): `scripts-tmp/zahlungsweg-liste.ts`, `scripts-tmp/lastschrift-september.ts`.
