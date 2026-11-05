# Kontoauszug-Import (CSV, CAMT, KI, Prüfungen)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“). Vor Änderungen an Erkennungsregeln die Vorher/Nachher-Prüfung aus `CLAUDE.md` → „Arbeitsweise“ machen.

## Klassifizierung

`src/app/(app)/kontoauszug/import`, Logik in `src/lib/import/`: Zeilen werden über `bank-csv.ts`, `zahlungen-import.ts`, `kosten-import.ts` klassifiziert und in `buchung-klassifizierung.ts` zu einem Buchungsart-Vorschlag je Zeile vereinheitlicht; Duplikate werden gegen bestehende Buchungen erkannt. Ein abweichender Vorschlag wird gelb markiert. Mietmonat-Vorschlag: `docs/zahlungen-kautionen.md` → „Mietperiode der Zahlung“; Darlehensraten: `docs/darlehen.md`.

**Kostenjahr** (`ermittleKostenjahrVorschlag`, `src/lib/import/kostenjahr.ts`, auch für geparkte Buchungen): Abbuchungsjahr, außer bei klarem Vorjahres-Hinweis — das direkte Vorjahr im Text ("Rauchwarnmelder 2022", "Hausmeister 12/2025"; nicht als Teil einer Rechnungsnummer wie "Rechnung Nr. 11/2023") oder eine Versorger-Jahresabrechnung "RNr. …" ohne "Abschlag" im ersten Halbjahr. Ältere Jahreszahlen zählen nicht.
- Niederschlagswasser-Bescheide ("NW 2024", abgebucht im März 2025) bleiben im Abbuchungsjahr — verworfen: Umstellung aufs Vorjahr (hat die Nebenkostenabrechnungen verfälscht).
- Von Hand setzen: Bescheide ohne Jahreszahl (z.B. Abfallbescheid am 2. Januar) und die Techem-Rauchmelderwartung (Rechnung im Januar fürs Vorjahr, ohne Jahreszahl im Zweck; Kostengruppe je Hausgruppe wählen — drei Rechnungen: Haus 2-12, 5-15, 14-18).

**Nebenkostenausgleich** (`NEBENKOSTENAUSGLEICH_PATTERN` in `bank-csv.ts`): Ein Treffer im Verwendungszweck gewinnt vor der Mietvertrags-Zuordnung über den Namen — fehlt eine Schreibweise im Muster, wird eine BK-Auszahlung als `MIETZAHLUNG` vorgeschlagen; neue Schreibweisen dort ergänzen. Ratenzahlungen einer BK-Nachzahlung ohne das Wort „Abrechnung“ („Betr.Kosten für 2024 1.Rate …“) zählen ebenfalls (erweitertes Zeitfenster nach Vertragsende). Haben Wohnung und Garage desselben Mieters denselben Score, entscheidet der Vertrag mit NK-Vorauszahlung (`MietvertragKandidat.nebenkosten`).

**Zahlung durch Dritte:** Steht im Verwendungszweck nur der Name eines Dritten (z.B. Angehöriger), gibt es bewusst keinen Vorschlag (ein bloßer Vornamen-Treffer reicht nie). Von Hand zuordnen und nicht den Mieter mit gleichem Vornamen wie der Zahler wählen.

**Mietminderung** (ausgehend, `MIETMINDERUNG_PATTERN`): als `KOSTENPOSITION` der Kostenart „Mietminderung“, **nicht** als negative Mietzahlung (wie beim Vorverwalter; die Minderung steht nie als Gutschrift auf dem Mieterkonto). Die Kostenart ist **nicht umlagefähig** und ohne Verteilerschlüssel — sonst liefe sie in die NK-Abrechnung (Warnung „kein Verteilerschlüssel“, ein späterer Schlüssel würde sie umlegen).

**Bewusst nicht korrigiert:** Abweichungen bei nicht umlagefähigen Positionen (Strom Garagen, Reparatur-Anteil).

## Mahngebühren

**Zwei gleichwertige Wege (Entscheidung 13.10.2026):**
- (a) Forderung auf dem Mieterkonto (Zahlungen → Neu → „Gebühr“ = `MAHNGEBUEHR`) und die Zahlung darauf als Gebühren-Zahlung — die Gebühr bleibt sichtbar, solange sie offen ist (für höhere Beträge und Rücklastschriftgebühren).
- (b) Keine Forderung; eine zur Miete mitgezahlte Mahngebühr als negative `KOSTENPOSITION` „Mahngebühren“ (Import-Vorschlag, schneller; so im Bestand).
- Steuerlich gleich: Maßgeblich ist der Zufluss (§ 11 EStG), beide enden in „Sonstige Einnahmen“ der Aufstellung (die Forderung selbst ist nicht EÜR-relevant). Vom Steuerberater nicht ausdrücklich bestätigt.
- **Nie als Mietzahlung:** ohne Forderung hebt sie den Mietsaldo künstlich an.

**Erkennung im Eingang** (`MAHNGEBUEHR_EINGANG_PATTERN`/`GEBUEHR_MAX_BETRAG` in `bank-csv.ts`, `mahngebuehr` in `kosten-import.ts`): kleiner Eingang ≤ 15 €, Verwendungszweck **endet** auf „Mahngebühr(en)" (auch „Manhgebuehr") → Weg (b), Kostenposition „Mahngebühren“ mit negativem Betrag (nicht umlagefähig, ohne Gebäude/Mieter). Nur der Text-Schluss zählt, weil Sammel-Lastschriften die Gebühren bei jedem Teilbetrag nennen und die Bank die Postenbezeichnung ans Ende hängt.
- Endet er auf „Rücklastschriftgebühr" (z.B. 5,22 €), ist es eine Zahlung auf die Rücklastschrift-Forderung → **Gebühren-Zahlung** (Sonderzahlung), keine Mietzahlung (siehe `docs/zahlungen-kautionen.md` → „Rücklastschrift-Gebühren buchen“).
- Summen aus beidem in einer Zeile (z.B. 7,13 €) werden nicht erkannt und von Hand aufgeteilt.

## CAMT-Import (Standardweg)

Das Online-Banking der Sparkasse liefert CAMT als **eine XML-Datei je Buchungstag** (nur Tage mit Umsätzen; Export „camt52“ = camt.052, Version 001.08 oder 001.02). Im Import alle Dateien des Zeitraums auf einmal markieren (nur XML, nicht mit CSV mischen). Parser `src/lib/import/camt.ts` (`parseCamtDateien`, `fast-xml-parser`, Namespace/Präfixe ignoriert; V2 und V8 ergeben bis auf den `Transaktionscode` dieselben Zeilen; camt.053 mit `Stmt` ist vorgesehen, aber nicht mit echten Dateien getestet).

- **Kern der Entscheidung:** Jede Buchung wird eine Zeile mit **denselben Spalten und Schreibweisen wie die Sparkasse-CSV** (ASCII-Umlaute, Datum TT.MM.JJ, Betrag „-625,22“, Buchungstexte wie in der CSV: V8-„GUTSCHRIFT UEBERWEISUNG“ → „GUTSCHR. UEBERWEISUNG“). Dadurch laufen Klassifizierung, Muster, Duplikaterkennung gegen die CSV-Altdaten, `mandatDetailsAusEinzug` und der Vollständigkeits-Check unverändert — neue Muster weiter auf die CSV-Schreibweise (`RUECK…`, `UEBERWEISUNG`) bauen.
- **Zusätzliche Rohdaten-Spalten:** `Bank-Referenz` (eindeutige Umsatz-ID, `FI-UMSATZ-ID`), `Rueckgabegrund` (z.B. „MD06 …“), `Transaktionscode`. Bei Rücklastschriften ist „Auslagenersatz Ruecklastschrift“ gefüllt (Bankgebühr) und die IBAN die des Zahlers (die CSV hatte dort das eigene Konto). Die Gegenpartei ist die Seite, die nicht unser Konto ist.
- **Gespeichert** wird die **zusammengeführte CSV** („Kontoauszug CAMT <von> bis <bis>.csv“, UTF-8, Sparkasse-Spalten + die drei XML-Spalten), damit Vollständigkeits-Check, Download und Aufräumen unverändert funktionieren; die XML-Dateien werden nicht aufbewahrt.
- **Saldoprüfung:** je Tag „Anfangssaldo + Buchungen = Endsaldo“ und Endsaldo = Anfangssaldo des nächsten Tages (so fällt eine fehlende Tagesdatei auf). Ergebnis als Box über der Importtabelle (`CamtPruefungBox` in `page.tsx`). Sie beweist die Vollständigkeit der **Dateien**, nicht dass alles gebucht ist.
- **Duplikatschlüssel** (`vollstaendigkeit.ts`): Datum|Betrag|Zweck|Name mit gefalteten Umlauten, dazu `weitereZeilenSchluesselAusRohdaten`: derselbe Schlüssel mit dem **Valutadatum** (manche Einzüge stehen in der CSV am Tag der Vormerkung, im CAMT am Tag der Wertstellung) und `id|<Bank-Referenz>`; sie landen in `bestehendeRohdaten` und werden in `istBereitsImportiert` geprüft. Gleiche Bank-Referenz in mehreren Dateien derselben Auswahl wird nur einmal übernommen; nicht gebuchte Einträge (`Sts` ≠ BOOK) werden übersprungen; Sammelbuchungen mit Einzelposten ergäben je Posten eine Zeile.
- Die CSV/Excel-Eingabe bleibt erhalten (Altdaten, Notfall). Tests nur lesend: `scripts-tmp/camt-test*.ts`.

## Doppelzahlungs-Prüfung

**Im Kosten-Import** (`src/lib/import/doppelzahlung.ts`, `ermittleDoppelzahlungHinweise` in `previewImport`, Hinweis „Mögliche Doppelzahlung“): Die normale Duplikaterkennung sieht eine Rechnung nicht, die zweimal mit anderem Datum und Text bezahlt wurde. Treffer, wenn bei einer ausgehenden Zeile **Rechnungsnummer** (nach RN/Rechnung/Rg/RE …, führende Nullen ignoriert, fehlendes Jahr passt zu jedem Jahr), **Betrag** (auf den Cent) und **Empfänger** (Name, IBAN oder Dienstleister) übereinstimmen und die Zahlungen höchstens 120 Tage (`MAX_TAGE`) auseinanderliegen — gegen gebuchte Kostenpositionen und innerhalb der Datei.
- Bewusst **nur ein Hinweis**, nichts wird blockiert; bei bereits importierten Zeilen unterdrückt.
- Ausnahmen: Abschlag/Rate/Teilzahlung/Anzahlung, „Dauerrechnung“, Kunden- und Vertragskontonummern, **Serien** (drei oder mehr gleiche Zahlungen gelten als wiederkehrend, nur die zweite einer neuen Serie wird gemeldet). Ohne Rechnungsnummer prüft sie nichts (Zufallstreffer).
- Rückwärtstest über alle Kontoauszüge 01/2023–10/2026: genau die 7 echten Doppelzahlungen, keine Fehlalarme.
- **Rückerstattung** einer Doppelzahlung = **negative Kostenposition** derselben Kostenart mit demselben Gebäude/derselben Einheit wie das Original; der Import schlägt das für bekannte Empfänger selbst als Gutschrift vor. Eine doppelte SEPA-Lastschrift lässt sich meist binnen 8 Wochen zurückgeben.

**Knopf „Doppelzahlungen prüfen“ auf der Kosten-Seite** (`kosten/doppelzahlung-pruefen.tsx`, `pruefeKostenDoppelzahlungen`, `ladeKostenDoppelzahlungen` in `src/lib/kosten-doppelzahlung.ts`): derselbe Abgleich über die gebuchten Kostenpositionen — nur auf Knopfdruck, nur lesend, auch für Gäste. Zeigt die Paare mit Links und ob schon eine Rückzahlung gebucht ist (negative Position über denselben Betrag nach der ersten Zahlung, mit derselben Rechnungsnummer oder vom selben Empfänger; offene oben, erledigte gedimmt). Aufgeteilte Positionen bleiben außen vor. Die IBAN wird nur für Kandidaten mit Rechnungsnummer aus `rohdaten` nachgeladen. Nicht abgedeckt: manuelles Erfassen unter Kosten → Neu.

## Vollständigkeits-Check und Import-Verwaltung

**Vollständigkeits-Check** (`kontoauszug/importe/actions.ts`, `src/lib/import/vollstaendigkeit.ts`): vergleicht jede Zeile der gespeicherten Datei über Datum + Betrag + Zweck + Name mit den `rohdaten` der Buchungen. Es zählen nur aktive Buchungen (Storno-Paare tragen dieselben Rohdaten). Stolperfalle: Eine neue Buchungsart mit Rohdaten muss in eine der Kategorien (Zahlung, Kosten, Mietweiterleitung, Kaution, Sonstige = Nebenkostenausgleich/Sonderzahlung/Sonderforderung/Darlehenstilgung), sonst gilt die Zeile als „ungeklärt“. Aufgeteilte Zeilen dürfen in mehreren Kategorien liegen.

**Importe** (`/kontoauszug/importe`, `importe-tabelle.tsx`): `DataTable` mit Dateisuche, Jahresfilter (erste vierstellige Jahreszahl im Dateinamen, sonst „Ohne Jahr“) und Auswahl; „Ausgewählte prüfen“ startet die Vollständigkeitsprüfung für die markierten, geprüfte werden übersprungen. Mehrfach hochgeladene Dateien erscheinen als eine Zeile (`id` = neuester Batch). „Aufräumen“ löscht nur Batches ganz ohne Buchung und ohne geparkte Buchung — die Anzeige (`verwaisteAnzahl`) muss genau dieses Kriterium zählen, sonst bleibt der Hinweis nach dem Klick stehen.

## KI-Prüfung im Import

`src/lib/import/ki-klassifizierung.ts`, `ki-actions.ts`, Knöpfe in `buchungen-tabelle.tsx`; braucht `ANTHROPIC_API_KEY` (in Vercel als „Sensitive“). Modell bewusst Haiku 4.5 (`KI_MODELL`; erst bei schlechten Treffern an echten Daten auf Sonnet wechseln).

- **Nur manuell ausgelöste Zweitmeinung** — die Regeln laufen zuerst. Ergebnisse sind Vorschläge mit Konfidenz und Ein-Satz-Begründung (Spalte „KI-Einschätzung“), vorbelegt, aber **nie automatisch zum Import ausgewählt**.
- **„Offene Zeilen mit KI prüfen“:** Zeilen, die die Regeln nicht sicher zuordnen; Vorschläge für Buchungsart, Kostenart, Mietvertrag, Kostenjahr und bei Mietzahlungen den Monat.
- **„Ausgewählte mit KI prüfen“:** alle zum Import ausgewählten Zeilen (höchstens 250, `MAX_ZEILEN`) mit ihrer aktuellen Zuordnung (`aktuell`), den letzten 8 Mietzahlungen des Vertrags (`verlauf`) und der Warmmiete. Die KI antwortet je Zeile mit `passt` bzw. der vollständigen Korrektur samt Mietperiode. Bestätigte Zeilen bleiben ausgewählt (✓), Widersprüche werden **abgewählt** und zeigen die Abweichung mit „Übernehmen“; Filter „KI-Widerspruch“. Zeilen eines Mieters werden gebündelt; der erste Batch läuft allein (Prompt-Cache), danach höchstens 4 parallel. Die Qualität der Monats-Einschätzung an echten Daten ist noch nicht geprüft (lokal nur mit API-Mock getestet).
- **Datenschutz:** IBAN/BIC werden vor dem Senden geschwärzt, Namen und Verwendungszwecke gehen mit; je Batch (20 Zeilen) zusätzlich die Listen der Buchungsarten, Kostenarten und Mietverträge (Mietername + Einheit). IDs aus der Antwort werden gegen die Listen geprüft. Ohne Key oder bei API-Fehler läuft der Import normal weiter.
- **Fehlersuche:** „KI-Prüfung fehlgeschlagen“ → `npx vercel logs --environment production --since 20m -q import -x`. `401 invalid x-api-key` = Key in Vercel falsch (Leerzeichen/Zeilenumbruch, unvollständig, nicht für Production). Neue Variablen gelten erst nach Redeploy; ein vorher geöffneter Tab meldet „Failed to find Server Action“ → hart neu laden. Der Key in der lokalen `.env` ist ungültig.
