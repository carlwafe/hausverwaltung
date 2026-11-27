# SEPA-Lastschrift der Vermieterin (Mandate, Einzugsdatei)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Gläubigerin und bestehende Mandate

Die Mieten werden per SEPA-Core-Lastschrift eingezogen, und **die Gläubiger-ID gehört der Vermieterin selbst, nicht dem Vorverwalter** (im Journal bestätigt: fast alle Mietzahlungen mit Mandat laufen unter dieser ID; alle aktiven Lastschrift-Verträge haben eine Mandatsreferenz in den Bankzeilen, manche mehr als eine). Gläubigerin = Vermieterin = Inhaberin des Mietkontos; der Eigentümer ist nur Kontobevollmächtigter und reicht die Dateien ein — eine eigene Gläubiger-ID des Bevollmächtigten wird nicht gebraucht (verworfen: getrennter „Zahlungsempfänger“ mit dessen ID).

- **Bestehende Mandate bleiben gültig**, solange Gläubiger-ID, Mandatsreferenz und Gläubiger-Kontoverbindung unverändert bleiben (sonst Änderung mit der Vorabankündigung mitteilen). Ein Mandat verfällt nach 36 Monaten ohne Einzug.
- Gläubigerdaten (Name, Anschrift, Gläubiger-ID) stehen bewusst **nicht im Quelltext**, sondern am `Objekt` (`sepaGlaeubigerName`, `sepaGlaeubigerAnschrift`, `sepaGlaeubigerId`), gepflegt unter „Objekt“ → „SEPA-Lastschrift (Mandate)“ (nur Admin; ID mit Mod-97-Prüfziffer geprüft, `glaeubigerIdGueltig`, ohne Leerzeichen in Großschreibung gespeichert).

**Stand:** Der Bevollmächtigte reicht die Einzugsdatei selbst bei der Bank ein, unter der bestehenden Vereinbarung und ID der Vermieterin; die Einreichung funktioniert, Rückläufer sind die Ausnahme. Die Vollmacht des Vorverwalters ist beendet, ein Doppeleinzug ausgeschlossen. Die Unterlagen der Mandate (Unterschrift, Datum) liegen nicht vor und werden nicht mehr angefordert: Das Unterschriftsdatum bleibt der Mietbeginn als Platzhalter, im Streitfall zählt das unterschriebene Mandat des Mieters.

## Mandate am Mietvertrag

Spalten `Mietvertrag.mandatReferenz`, `mandatGlaeubigerId`, `mandatDatum` (Unterschrift), `mandatKontoinhaber`, `mandatIban` (alle optional). Anzeige im Block „SEPA-Lastschriftmandat“ der Vertragsdaten (bei Lastschrift ohne Mandat ein Hinweis), Pflege in „Mietvertrag bearbeiten“ (Gläubiger-ID und IBAN mit Prüfziffer geprüft).

- **Übernahme aus dem Journal:** `mandatDetailsAusEinzug` (`src/lib/lastschrift-mandat.ts`) liest nur echte Einzüge (bei Rückbelastungen steht in der IBAN-Spalte das eigene Konto); Zahler-IBAN = „Kontonummer/IBAN“, Kontoinhaber = „Begünstigter/Zahlungspflichtiger“. Bestand per Einmalskript `scripts-tmp/mandate-uebernehmen.ts [--write]` übernommen (überschreibt nichts; bei mehreren Referenzen die des jüngsten Einzugs — die Endung „-1“ steht für ein später neu erteiltes Mandat).
- **Neue Lastschrift-Mieter:** Knopf „Aus Kontoauszug übernehmen“ im Block „SEPA-Lastschriftmandat“ (`holeMandatAusKontoauszug`, `ladeMandatAusKontoauszug`) füllt nur die Formularfelder aus dem jüngsten Einzug; gespeichert wird mit „Speichern“, bei abweichenden Werten fragt das Formular nach. Geht erst nach dem ersten importierten Einzug; fehlt in „Neuer Mietvertrag“.
- **Unterschriftsdatum** steht in keiner Bankzeile. Bei allen übernommenen Mandaten steht ersatzweise der **Mietbeginn** — ein Platzhalter, kein belegtes Datum. Ein echtes Datum wird nur bei neu unterschriebenen Mandaten eingetragen.
- Die Anpassungsschreiben (Vorabankündigung) nehmen Referenz und Gläubiger-ID zuerst vom Vertrag, sonst aus dem Journal (`ladeLastschriftMandat`).

## Seite „Lastschrift-Mandate“ (temporär)

Menü Vermietung → `/mietvertraege/lastschrift-mandate`, Einzelmandat `/mietvertraege/[id]/lastschrift-mandat`, Sammeldruck `…/drucken?ids=…` (`src/components/mandat-blatt.tsx`, `mandat-seite.tsx`, `src/lib/sepa-mandat.ts`, `mandat-laden.ts`). Für neue Mandate (Überweiser, die umstellen, neue Verträge, geänderte Gläubigerin/Kontoverbindung). Entfällt, sobald Mandate in der App vollständig erfasst und gedruckt werden.

- Je Vertrag ein A4-Mandat mit Mieter und Mietobjekt vorausgefüllt (Kontoinhaber, Bank, IBAN, Datum, Unterschrift füllt der Mieter aus); mehrere Verträge in einem Druck (`break-after: page`, nur über den Druckdialog getestet). **Ausgedruckte Mandate werden nicht gespeichert**; das unterschriebene Mandat als Scan in der Mieterakte ablegen.
- Gläubigerdaten kommen über `ladeGlaeubiger()` vom Objekt, sind für den einzelnen Ausdruck änderbar (nichts gespeichert); Drucken erst, wenn alle drei ausgefüllt sind.
- **Filter „Mandat“** (Standard: ohne Mandat – Mieter zahlt selbst; außerdem ohne Mandat – Jobcenter/Kreis zahlt, mit Mandat, alle). Der Zahler kommt aus den Zahlernamen der Mietzahlungen der letzten 12 Monate (`ladeZahler`: „Bundesagentur“/„Jobcenter“ bzw. „Kreis Ostholstein“; zahlt der Mieter daneben selbst, „Jobcenter + Mieter“, zählt zu den Amt-Zahlern; ohne Zahlung gilt er als Selbstzahler) und wird nur für Verträge ohne Mandat berechnet. Jobcenter-Mieter lassen sich meist nicht einziehen. Bei vorhandenem Mandat ist „Neu erstellen“ gedämpft, die Einzelseite warnt.
- **Mandatsreferenz** für neue Mandate je Einheit vorgeschlagen (`mandatsreferenz()`: Teil der Bezeichnung vor „ - “, nur A–Z/0–9, z.B. „EUT-HS6WHG4-001“, höchstens 35 Zeichen, ohne Personendaten). Bei bestehendem Mandat die vorhandene Referenz beibehalten; bei einem zweiten Mandat derselben Einheit die Endnummer von Hand hochzählen (die App prüft das nicht).
- **Mandatstext:** Ermächtigung + Weisung an die Bank, 8-Wochen-Erstattung (13 Monate bei nicht autorisierten Einzügen), Vorabankündigung auf einen Kalendertag verkürzt (Einzug am 3. Werktag, Betragsänderungen kündigt das Anpassungsschreiben an), Verfall nach 36 Monaten.

## Einzugsdatei pain.008

Sammellastschrift als **pain.008.001.08** (`src/lib/sepa-pain008.ts`: reine Funktionen, Prüfung von IBAN/Referenzen/Längen, SEPA-Zeichensatz, gegen die offizielle XSD geprüft). Erzeugt wird sie auf der Seite **Geld → Lastschrift-Einzug** (`/lastschrift-einzug`, Rechnung `src/lib/lastschrift-einzug.ts`, Download `/api/lastschrift-einzug`): Mietmonat (Vorschlag: der nächste noch offene Einzug) und optional ein Einzugstermin wählen, „Berechnen“, Vorschau prüfen, „Datei herunterladen“. Die Berechnung schreibt nichts (nur der Merker unten wird gespeichert), rechnet erst auf Knopfdruck und ist für Gäste gesperrt (enthält IBANs). Jeden Monat neu erzeugen und selbst bei der Bank hochladen; jede Datei bekommt eine neue Nachrichten-ID. Das ältere Leseskript `scripts-tmp/pain008-erzeugen.ts` (mit `--vergleich`) bleibt als Gegenprobe; beide liefern für denselben Monat dieselben Einzüge.

- **Vorschau:** je Einzug Betrag, letzter Monatseinzug aus dem Journal und Hinweise (Betrag geändert → Mieterhöhung muss angekündigt sein; kein Monatseinzug im Journal; Rücklastschriften der letzten 6 Monate; erster Einzug = FRST). Mit „Diesmal nicht“ lässt sich ein Vertrag einmalig ausnehmen (nach Ändern der Haken „Neu berechnen“); dauerhaft geht das über den Zahlungsweg `UEBERWEISUNG`. Verträge, die nicht in die Datei kommen (Mandat unvollständig, Vertrag zu Ende …), stehen mit Grund darunter.
- **Merker „eingereicht“** (Tabelle `lastschrift_einreichungen`, kein Buchungsjournal, also löschbar): Nach dem Hochladen bei der Bank „Als eingereicht markieren“ — gespeichert werden Mietmonat, Termin, Anzahl, Summe, die Vertrags-IDs der Datei und wer markiert hat. Weitere Dateien desselben Monats lassen diese Verträge aus (Haken gesperrt, Hinweis „schon eingereicht“); sind alle markiert, zeigt die Seite „nichts mehr einzuziehen“ und bietet keinen Download an. Für eine Nachreichung (z.B. ein neuer Mieter) einfach eine neue Datei berechnen — sie enthält nur die Rest-Verträge. Wurde die Datei abgelehnt oder versehentlich markiert: „Merker entfernen“. Die App erfährt nichts von der Bank; der Merker ist die Selbstauskunft des Nutzers.
- **Termin:** Warnung, wenn er kein TARGET-Bankarbeitstag ist oder heute/in der Vergangenheit liegt. Die Einreichungsfrist der eigenen Bank kennt die App nicht.
- **Zeitzone:** Datumsrechnung in UTC wie die Datumsfelder der App, Zeitstempel der Datei in deutscher Zeit (`CreDtTm`), auch auf einem Server in UTC.

- **Wer:** ein Einzug je Vertrag mit Zahlungsweg `LASTSCHRIFT`, nicht beendet (`vertragNichtBeendet`), Mietbeginn ≤ Monatsende, Vertragsende nicht vor dem Einzugstermin, vollständigem Mandat (Referenz, IBAN mit Prüfziffer, Kontoinhaber) und der Gläubiger-ID des Objekts. Wer nicht mehr eingezogen werden soll (z.B. weil die Lastschrift jeden Monat zurückgegeben wird), bekommt den Zahlungsweg `UEBERWEISUNG` am Vertrag — dann fällt er dauerhaft heraus; `--ohne` nur für eine einmalige Ausnahme.
- **Betrag** = Kaltmiete + BK-Vorauszahlung + ggf. Mehrwertsteuer des Monats nach Mieterhöhungen, abzüglich Mietnachlass (`ermittleMieteFuerMonat`). Gegenprobe mit `--vergleich`: Für Oktober 2026 stimmten alle berechneten Beträge mit den eingezogenen überein.
- **Termin** = 3. Bankarbeitstag des Monats (TARGET, wie der vertragliche Fälligkeitstermin); früher geht nicht (Core braucht einen Bankarbeitstag Vorlauf, die Vorabankündigung nennt den 3. Werktag).
- **Sequenz:** alle als Folgelastschrift (RCUR) in einem Sammler (`BtchBookg` true), weil jedes Mandat schon eingezogen wurde; ein Mandat ohne Einzug in 36 Monaten ginge als FRST in einen eigenen Sammler.
- **Unterschriftsdatum:** das am Vertrag erfasste, sonst der Mietbeginn — nur, wenn er nicht nach dem ersten Einzug im Journal oder in der Zukunft liegt (die Bank prüft das Datum nicht; im Streitfall zählt das unterschriebene Mandat).
- **Verwendungszweck:** „Miete+BK MM.JJJJ <Einheit>“ (ohne Namen); die Mieternummer des Vorverwalters steht nicht in der DB.
- **End-to-End-ID** = „MJJMM-“ + Ende der Mandatsreferenz (≤ 35 Zeichen); teilen sich Wohnung und Garage eines Mieters ein Mandat, bekommt der zweite Einzug „-2“ (dieselbe Referenz zweimal am selben Tag ist erlaubt).
- **Abnahme vor dem Einreichen:** gegen die XSD prüfen, Kopfsumme/Anzahl nachrechnen, IBAN und Referenz je Einzug mit dem letzten echten Einzug vergleichen, Beträge mit dem letzten Einzug vergleichen (Abweichung = Mieterhöhung, die angekündigt sein muss), nach Rückbelastungen suchen (negative `MIETZAHLUNG` mit „RUECKLASTSCHRIFT“ in Bemerkung/Verwendungszweck; die Rückbelastungs-Tabelle von `scripts-tmp/pain008-abnahme.ts` ist ein Fehlalarm, ihr Suchbegriff trifft jede Zeile).
- Der Einzug selbst erzeugt keine Buchung, erst die Bankgutschrift (Import).

**Noch nicht gebaut:** eigene Mandatstabelle mit Status/Historie, Abgleich der Gutschriften aus dem Import mit dem Einzugslauf.

## Lastschriften im Kontoauszug lesen

- **Mieteinzug:** Buchungstext `EINZELLASTSCHRIFTEINZUG`, positiver Betrag. `FOLGELASTSCHRIFT`/`EINMAL LASTSCHRIFT` mit negativem Betrag sind Abbuchungen von uns (Stadtwerke, Handwerker), `LS RUECKBELASTUNG` eine zurückgegebene Lastschrift.
- Die CSV der Bank ist **Windows-1252**. Mandatsreferenzen des Bestands haben die Form „Breslauer-Str-5-WHG-4“; der Verwendungszweck beginnt mit der Mieternummer des Vorverwalters („2000.4401-09.26 MIETE+BK“).
- Zuordnung nur über den Zahlernamen ist nicht eindeutig (Wohnung + Garage, gleiche Nachnamen im Haus, Schreibvarianten) — zusätzlich die Hausnummer in der Mandatsreferenz nutzen.
- **Größenordnung** (09/2026): Monatslauf am 3. mit gut 50 Einzügen über rund 26.500 €, dazu einzelne Einzüge von Abrechnungsergebnissen Mitte des Monats.
- **Stolperfalle Lastschrift nach Vertragsende:** Ein zum Monatsende beendeter Vertrag wurde im Folgemonat noch eingezogen — beim Vertragsende die Lastschrift sofort stoppen bzw. den Vertrag aus der Einzugsliste nehmen und den Einzug zurückgeben oder verrechnen.
- Leseskripte (nicht im Git): `scripts-tmp/zahlungsweg-liste.ts`, `scripts-tmp/lastschrift-september.ts`.
