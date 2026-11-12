# Berichte und Steuer (Jahres-/Quartalsübersicht, Aufstellung, Jahresbericht, AfA)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Jahres-/Quartalsübersicht

`jahresuebersicht/`, eine Seite für beide (Auswahl "Zeitraum" Gesamtjahr/Q1–Q4; `/quartalsuebersicht` leitet nur weiter). Gemeinsame Komponente `bericht-seite.tsx` mit `Zeitraum`, Rechnung `berechneMieterBericht` in `src/lib/jahresbericht-mieter.ts`.

- **Erst auf Knopfdruck:** Der Menüpunkt zeigt nur die Auswahl (Jahr, Zeitraum, „Anzeigen“); berechnet wird erst mit `?jahr=…&quartal=…`, die Dropdowns senden nicht automatisch ab (Vercel-CPU).
- Sterne, Kommentare und Kontenabgleich-Verifikation hängen an Jahr + `quartal` (0 = Gesamtjahr) und dienen dem Abgleich mit dem Vorverwalter (`docs/abgleich-vorverwalter.md`).
- **Mieter-Tabelle nach Mietperiode** (`periodeJahr/periodeMonat`), nicht nach Zahlungsdatum — eine Ende Dezember für Januar gezahlte Miete zählt zum Folgejahr. Der Vorverwalter zählt nach Zahlungsdatum (Differenzen gleichen sich im Folgequartal aus).
- **EÜR-Einnahmen nach Zahlungsdatum, Kosten nach Abbuchungsdatum** (Abflussprinzip), **nicht** nach dem Kostenjahr: `Buchung.jahr` einer `KOSTENPOSITION` wirkt nur in der NK-Abrechnung (z.B. Abfallbescheid 2024, abgebucht am 2.1.2025 → Jahresübersicht 2025, NK-Abrechnung 2024). Positionen ohne Datum zählen im Kostenjahr und fehlen im Quartal. Kontostand-Verlauf und Kontenabgleich sind ebenfalls datumsbasiert. Die 10-Tage-Regel ist für Kosten bewusst nicht umgesetzt (wie beim Vorverwalter; für Mieten nur in der Aufstellung, siehe unten).
- **NK-Abrechnung des Vorjahres:** In **Q1 und Q2** entfällt die Spalte "Nebenkostenabrechnung offen (Vorjahr)" (die Abrechnung liegt meist erst in Q3 vor; `mitNkOffen`); ab Q3 und im Gesamtjahr fließt Nachzahlung/Guthaben in Saldo neu ein. **Die Gutschrift der unbezahlten NK-Vorauszahlung zählt dagegen datumsgenau ab dem Versand** (Spalte im Quartal des Versands, danach in Saldo alt; siehe `docs/nebenkosten.md` → „Versand der Abrechnung“). Verworfen: Gutschrift in Q1/Q2 schon ab Jahresanfang (vor dem Versand besteht der Rückstand tatsächlich).
- Mieter ohne Bewegung und mit Saldo 0 blendet `berechneMieterBericht` aus, **außer** es hängt ein Kommentar für Jahr + `quartal` an (`immerAnzeigen`), damit der Abgleich-Kommentar nicht verschwindet.
- Die Mieter-Tabelle (`mieter-tabelle.tsx`) ist eine `DataTable` mit Suche, Sortierung und Summenzeile über die sichtbaren Zeilen, Standardsortierung nach Einheiten-Reihenfolge. Verträge mit eigenem Stichtag („Buchhaltung ab“) sind mit „Stichtag …“ gekennzeichnet und rechnen auch ihre früheren Jahre; die Summenzeile mischt dann unterschiedliche Stichtage (`docs/mietvertraege-mieter.md`).
- Spalte „Soll Nebenkosten / MwSt.“: Die Umsatzsteuer der Garagen steht dort in der Nebenkosten-Spalte (`sollNebenkosten` = Soll − Kaltmiete; die JSON-Ausgabe von `quartal-app.ts` bleibt so).

## Aufstellung für die Steuererklärung

Abschnitt in der Jahresübersicht (nur Gesamtjahr, `AnlageVAufstellung` in `bericht-seite.tsx`, Logik `src/lib/anlage-v.ts`, `src/lib/miete-aufteilung.ts`). Grundlage ist die Rückmeldung des Steuerberaters: Ein Jahresbericht mit Einnahmen und Ausgaben genügt (keine Einzelbuchungen); wichtig sind vereinnahmte Mieten und Nebenkosten (getrennt), Instandhaltung separat, Kosten nach umlagefähig/nicht umlagefähig, der Zinsanteil der Darlehen. Eine Gliederung nach Zeilen 47/48/50 der Anlage V ist nicht nötig (verworfen).

**Aufbau**
- Einnahmen = Mieten (Kaltmiete), Nebenkosten, Kautionseinbehalte nach Art, Sonstiges, ggf. Umsatzsteuer Garagen.
- Kosten = Instandhaltung, umlagefähig, nicht umlagefähig, Schuldzinsen.
- Überschuss **vor AfA**, nach den gebuchten Schuldzinsen (ohne Zinsbuchungen heißt er „vor AfA und Schuldzinsen“, `ueberschussBezeichnung`). **AfA fehlt bewusst** (keine Buchungen; bestimmt der Steuerberater). Die Tilgung steht nirgends (nicht abzugsfähig).
- **Schuldzinsen:** Zeile „Schuldzinsen (Darlehen)“ = über das Mietkonto gebuchte Zinsen + Jahreswerte „Zinsen von anderen Konten“ (`schuldzinsenAndere`), mit zwei „davon“-Zeilen; Details in `docs/darlehen.md`.

**Mieten/NK-Trennung** (`teileMietzahlungen`): teilt jede Mietzahlung je Vertrag und Mietperiode — Soll aus `ermittleMieteFuerMonat`, Teilzahlungen nach der Tilgungsreihenfolge (bis 2024 NK zuerst, ab 2025 anteilig; `nk-anteil.ts`, Regel und Beispiel in `docs/zahlungen-kautionen.md`). Die kumulierte Zahlung einer Periode wird aufgeteilt (mehrere Zahlungen ergeben zusammen dieselbe Aufteilung). Rücklastschriften nehmen zuerst Kaltmiete zurück. Dem Zeitraum zugeordnet nach **Zahlungsdatum** (Zufluss), aufgeteilt nach Mietperiode (ohne Periode: Monat des Buchungsdatums); frühere Zahlungen derselben Mietmonate werden mitgeladen. Mieten + Nebenkosten = Summe der Mietzahlungen.

**Nebenkosten mit „davon“-Zeilen:** „Vereinnahmte Nebenkosten“ ist eine Summe (Anlage V Z. 13 „Umlagen, verrechnet mit Erstattungen“: Vorauszahlungen + Nachzahlungen − ausgezahlte Guthaben; im übrigen Bericht stehen Guthaben als Ausgabe, das Ergebnis ist gleich), darunter Vorauszahlungen, Nachzahlungen und Erstattungen. In der CSV stehen die „davon“-Zeilen im eigenen Abschnitt „Einnahmen (davon)“, damit eine Spaltensumme nichts doppelt zählt. Erwartete Abweichungen zur EA des Vorverwalters: Vorauszahlungen höher (Aufteilung der Teilzahlungen, 10-Tage-Regel), Nachzahlungen ohne seine Kautionsverrechnung — Mieten und Nebenkosten zusammen stimmen.

**Kautionseinbehalte nach Art:** keine Zeile „Verrechnete Mietkautionen“; ein `KAUTION_EINBEHALT` zählt je nach Art:
- mit Abrechnungsjahr („Verrechnung mit Nebenkostenabrechnung“) → Nachzahlung der NK-Abrechnung (Hinweis „darin X mit Kaution verrechnet“);
- `bezugTyp = MIETERKONTO_VERRECHNUNG_BEZUG` → Miete bzw. Rückstand (Näherung: auch Gebühren zählen hier als Miete);
- sonst pauschaler Einbehalt → sonstige Einnahmen.
Der Bericht darüber behält die Zeile „Kaution-Einbehalte“; Summe und Überschuss ändern sich nicht.

**Kostenarten** (`Kostenart.anlageVZeile`, Enum `AnlageVZeile`): Im Formular „Instandhaltung“ (`ERHALTUNGSAUFWAND`), „Sonstige Einnahme“ (`SONSTIGE_EINNAHMEN`, z.B. Waschgeld, Mahngebühren), „Anschaffung / Herstellung“ (`ANSCHAFFUNG`, siehe unten) und „Schuldzinsen“ (`SCHULDZINSEN`); sonst gilt der Vorschlag (`vorschlagKostengruppe`): Name mit „Reparatur“ = Instandhaltung, mit „Einnahmen“/„Mahngeb“ = Einnahme, sonst nach `umlagefaehig`. Die Werte `BETRIEBSKOSTEN`, `VERWALTUNG`, `SONSTIGES` stammen aus einer verworfenen Fassung und zählen wie „automatisch“. Offen mit dem Steuerberater: Die Mietminderung mindert eigentlich die Mieteinnahmen und läuft bisher unter den Kosten.

**Umsatzsteuer auf Garagenmieten:** eigene Zeile „Vereinnahmte Umsatzsteuer (Garagenmieten)“, nicht in Kaltmiete oder Nebenkosten (`teileMietzahlungen` rechnet sie anteilig am Gesamtsoll — Kalt + NK + `Mietvertrag.mehrwertsteuer` — heraus). Seit der Kleinunternehmerregelung (`docs/mietvertraege-mieter.md` → „Garagen“) ist sie nur noch für Bestandsverträge gefüllt und zeigt die an die Mieter zu erstattende Umsatzsteuer; eine Abführung ans Finanzamt gibt es nicht. Wie die Erstattung in der Anlage V zu behandeln ist, klärt der Steuerberater.

### 10-Tage-Regel für die Mieteinnahmen

Eine im Voraus gezahlte Januarmiete, die ab dem 22.12. eingeht (Mietperiode Januar des Folgejahres), zählt in der Aufstellung zum Folgejahr (§ 11 Abs. 1 Satz 2 EStG, `zuflussJahrMiete` in `miete-aufteilung.ts`). Die Gegenrichtung gibt es nicht (eine im Januar gezahlte Dezembermiete war im Dezember fällig).
- Der Überschuss der Aufstellung weicht deshalb um diese Abgrenzung vom Ergebnis des Berichts ab; die Tabelle darunter leitet über. Bericht, Quartalsübersicht und Kontenabgleich zählen weiter nach Zahlungsdatum (müssen zur Bank passen).
- Greift nur bei richtiger Mietperiode der Zahlung; **für Kosten nicht umgesetzt** (Fälligkeit unbekannt, vom Steuerberater nicht verlangt).
- **Warum nötig:** Der Vorverwalter bucht Dezember-Zahlungen für Januar auf 9600, holt sie im Folgejahr aber nur in Einzelfällen zurück. Ohne die Regel fielen sie in keinem Jahr an; seine EA 2025 ist dadurch um 3.234 € zu niedrig (Dezember 2024 für Januar 2025 nicht nachgeholt) — den Steuerberater darauf hinweisen.

### Export für den Steuerberater

- **Druckansicht** `/jahresuebersicht/aufstellung?jahr=…` (A4, 2 Seiten, „Drucken / als PDF sichern“): Aufstellung mit Überschuss = Einnahmen − Kosten, die 10-Tage-Regel nur als Hinweiszeilen „enthalten / nicht enthalten“ (der Vergleich mit dem Bericht bleibt der App vorbehalten), Anlage Kosten nach Kostenart und alle Bestandteile der „Sonstigen Einnahmen“ (Gutschriften auf Kostenarten, Zahlungen auf Gebühren-Forderungen, übrige Buchungen — ihre Summe muss die Zeile ergeben, `sonstigeEinnahmenZeilen`).
- **CSV** `/api/aufstellung?jahr=…` (Semikolon, Dezimalkomma, UTF-8 mit BOM). Logik `src/lib/aufstellung-export.ts`. Beide nur lesend, von der Jahresübersicht (Gesamtjahr) verlinkt.
- **Kontrolle nach Änderungen:** Überschuss der Aufstellung = Ergebnis laut Bericht + Anschaffung − Zinsen anderer Konten ± 10-Tage-Abgrenzung (Leseskript `scripts-tmp/anlage-v-probe.tsx`; `scripts-tmp/miete-aufteilung-test.ts` prüft Aufteilung und Regel).
- Belegpflicht-Hinweis auf Jahresübersicht und Aufstellung: `docs/dokumente.md` → „Belegpflicht“.

## Anschaffungs-/Herstellungskosten (AfA)

Einordnung `ANSCHAFFUNG` an der Kostenart („Anschaffung / Herstellung“). Anlass: Eine Einbauküche ist ein eigenes Wirtschaftsgut (über der GWG-Grenze von 800 € netto über die Nutzungsdauer abzuschreiben, typisch 10 Jahre), ebenso Herstellungskosten am Gebäude (Modernisierung/Sanierung, anders als Instandhaltung). Vorgesehen für „Modernisierung/Ausstattung“ und „Sanierungsarbeiten“ — **von Hand zu setzen**.

- **Gilt ab Berichtsjahr 2026** (`AFA_AB_JAHR` in `src/lib/anlage-v.ts`, `kostengruppeFuer(kostenart, jahr)`); 2025 und früher bleiben, wie sie dem Steuerberater vorliegen, bei den Kosten.
- **Wirkung in der Aufstellung:** Die Summe zählt nicht zu Kosten und Überschuss, sondern steht gesondert mit den **Einzelposten** (Datum, Wohnung/Gebäude/Haus, Empfänger, Rechnungstext, Betrag, bezugsbereit ab, Mietvertrag der Wohnung zum Rechnungsdatum als Anhaltspunkt; `ladeAfaPositionen`, `src/lib/afa-positionen.ts`) in Jahresübersicht, Druckansicht und CSV. Jahresbericht und Kontenabgleich zählen sie weiter als Ausgabe; die Überleitung hat die Zeile „Zuzüglich Anschaffungs-/Herstellungskosten“.
- **Die App rechnet die Abschreibung nicht selbst** — Satz und Nutzungsdauer bestimmt der Steuerberater aus den Einzelposten.
- **Zuordnung einer Küche:** Lieferung und **Aufbau/Anschluss** (Montage, Anschlüsse nur für die Küche) gehören zusammen → „Modernisierung/Ausstattung“; Trockenbau-/Malerarbeiten danach und Leitungsarbeiten am Gebäude bleiben „Reparaturen“.
- **„Bezugsbereit ab“ ist Pflicht** (`Buchung.bezugsbereitAb`, `verlangtBezugsbereit`): bei Kostenpositionen einer Kostenart „Anschaffung / Herstellung“ ab Buchungsjahr 2026, weil der Abschreibungsbeginn daran hängt (nicht ableitbar — Mietbeginn und Küchenlieferung liegen oft auseinander). Im Kosten-Formular (Feld erscheint nach Wahl der Kostenart, Aktion lehnt ohne Datum ab) und im Import (Zeile ohne Datum nicht auswählbar, `commitBuchungen` prüft). Bearbeiten, Aufteilen und Rückgängig übernehmen den Wert; bei anderen Kostenarten wird er verworfen. **Nicht abgedeckt:** Zuordnen geparkter Buchungen, Umbuchen und Aufteilen einer Zahlung in Kosten — dort über „Bearbeiten“ ergänzen. Fehlt es, steht in der AfA-Liste „bezugsbereit ab: fehlt“.
- Stolperfalle: Wer eine Kostenposition umbucht, muss prüfen, dass die **Kostenart selbst** auf „Anschaffung / Herstellung“ steht — sonst bleibt die Buchung bei den Kosten.
- **Offen:** Küche aus Dezember 2025 (2025 als Sofortabzug gebucht, nach der Regel „ab 2026“ unverändert) samt Aufbau vom Februar 2026 — mit dem Steuerberater klären.

## Jahresbericht Kontoführung (PDF)

Zwei Berichte über dieselben Buchungen, Link „Jahresbericht nach Monaten/nach Gruppen (PDF)“ unter dem Kontenabgleich der Jahresübersicht (nur Gesamtjahr). Route `/api/jahresjournal?jahr=…` (nur lesend, auch Gäste, rechnet nur auf Knopfdruck; `&ansicht=gruppen`, `&stornos=1` hängt dem Monatsbericht die stornierten Buchungen an). Daten `ladeJahresjournal` (`src/lib/jahresjournal.ts`), PDF mit `pdf-lib` (A4 quer, Standardschrift) in `src/lib/jahresjournal-pdf.ts` bzw. `jahresjournal-gruppen-pdf.ts`.

**Nach Monaten** — Aufbau nach den Mindestanforderungen an eine Einnahmen-/Ausgabenabrechnung mit Kontoständen:
- Übersicht (Anfangsbestand + Einnahmen + Ausgaben = Endbestand, Rechenprobe, Bewegungen nach Buchungsart mit Kennzeichen ergebnis-wirksam/durchlaufend, Abstimmung mit `KontostandKontrolle` und der Verifikation des Kontenabgleichs), Monatsübersicht, Journal mit **jeder zahlungswirksamen Buchung** (laufende Nummer, Datum, Art, Gegenpartei/Zweck, Zuordnung, Einnahme/Ausgabe, Kontostand; Monatskopf/-summe, „Übertrag“ am Seitenanfang). Rund 90 Seiten pro Jahr.
- Gleiche Zahlengrundlage wie Kontostand-Seite und Kontenabgleich (`ladeKontostandEintraege`, Kostenpositionen mit gedrehtem Vorzeichen, geparkte Buchungen als „Nicht zugeordnet“); der Endbestand wird unabhängig über `kontostandAmStichtag` nachgerechnet (bei Abweichung rot).
- Nur **aktive** Buchungen (Storno-Paare heben sich auf, Gegenbuchungen tragen das Datum des Originals); Buchungen ohne Geldfluss (Gebührenforderungen, Kautionseinbehalte) fehlen bewusst. Jahresgrenzen in UTC. Läuft das Jahr noch, heißt der Endbestand „nach der letzten Buchung“ (Kopf „Zwischenstand“).
- Kontrollwerte stehen nur, wenn unter „Kontostand prüfen“ bzw. in der Verifikation ein Kontoauszug-Stand eingetragen ist; sonst ist der Endbestand rein rechnerisch (der Bericht sagt das).
- Stolperfalle: Die Standardschrift kennt nur WinAnsi — Sonderzeichen aus Bankdaten ersetzt `Bericht.sicher` (sonst wirft `drawText`).

**Nach Gruppen** (sachlich geordnet wie beim Vorverwalter; Entscheidung: zwei getrennte Berichte statt eines gemischten):
- Vorn Summenübersicht je Gruppe/Kostenart und Rechenprobe (Anfangsbestand + Summe aller Gruppen = Endbestand); jede Buchung steht mit der laufenden Nummer des Monatsjournals in genau einer Gruppe. Gruppen aus `Kostenart.umlagefaehig` und Buchungsart, nicht aus den Kontonummern des Vorverwalters.
- **Mieter-Übersicht mit einer Zeile je Mietvertrag** (je Haus mit Summen): Saldo 01.01., Soll Kaltmiete, Soll NK/USt, Gezahlt (nach Mietperiode, **bewusst nicht in kalt/NK geteilt**), Gebühren gefordert/gezahlt (inkl. Verrechnungen ohne Geldfluss), ggf. NK-Gutschrift, **NK-Abrechnung des Vorjahres** und **NK-Ausgleich** (Vorzeichen des Mietsaldos, `berechneMieterNkAusgleich`), Saldo 31.12. Daten aus `ladeMieterZeilen` + `berechneMieterSonderbewegungen`; Rechenprobe je Zeile (Saldo neu = Saldo alt − Soll + Gezahlt − Gebühren gef. + Gebühren gez. + NK) und Überleitung Kontoauszug (Zahlungsdatum) → Mieter-Übersicht (Mietperiode) mit „nicht erklärter Differenz“ 0,00.
- Dazu Nebenkosten-Ausgleich/Gebührenzahlungen einzeln (je Haus und Wohnung) — bleibt neben den NK-Spalten, weil diese nur Verträge mit Abrechnungsposition in der App zeigen (ältere Jahre führte der Vorverwalter); Kosten umlagefähig / nicht umlagefähig (je Kostenart, darunter je Haus/Gebäude/Kostengruppe/„Gesamtes Objekt“, netto), durchlaufende Posten, nicht zugeordnete.

## Kontenrahmen (offen)

Es gibt keine Sachkonten, keinen Kontenrahmen (SKR03/SKR04) und keinen DATEV-Export; `Kontokreis` (Miet-/Kautions-/Objektkonto) meint nur die Bankkonten. Welcher Kontenrahmen gilt, klärt der Nutzer mit dem Steuerberater — bis dahin keine Kontonummern erfinden oder aus den Altberichten übernehmen. Deren Nummern sind der eigene Kontenplan des Verwalterprogramms (PowerHaus/Aareon), **nicht SKR03/SKR04**. Lesehilfe: 1100 Bank, 1361/1362 Zwischenkonten Lastschrift/Überweisung, 3500 Kautionen, 42xx–45xx Kosten (umlagefähig/nicht umlagefähig getrennt, Wasser/Strom/Gas/Grundsteuer je Hausgruppe), 7000 Einlage Eigentümer, 7100 Entnahme Eigentümer (= Mietweiterleitung), 7300 Waschgeld, 8000 Mahngebühren/Erstattungen, 9600 Überzahlung (Januar-Abgrenzung).
