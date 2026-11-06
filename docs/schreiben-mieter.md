# Schreiben an Mieter (Indexmiete, NK-Anpassung, Betriebskostenabrechnung, Mahnung/Kündigung, Optik)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

Es gibt zwei Arten von Schreiben:
- **Anpassungsschreiben der App** (Indexmiete, NK-Vorauszahlung): HTML-Seite, gedruckt per `window.print()` (nur `.druckbereich`, CSS in `globals.css`), Georgia — bleiben, wie sie sind.
- **Alle übrigen Briefe** (BK-Abrechnung, Mahnung, Korrektur, Kündigung, Garagen, Zahlungserinnerung): Layout „klar“, als PDF über `erzeugeSchreibenPdf` oder als Word/PDF über die Skript-Vorlage.

Das SEPA-Mandat (`mandat-blatt.tsx`) und die Steueraufstellung (`aufstellung/page.tsx`) sind Formulare bzw. Berichte mit eigener Optik.

## Indexmiete und Mieterhöhungen

§ 557b BGB. Seiten: Liste `/mietvertraege/moegliche-erhoehungen` (Menü „Mieterhöhung“ unter Stammdaten; die Spalte heißt weiter „Mieterhöhung möglich ab“, die Spalten sind nur Vorschau), Pflege `/mietvertraege/vpi-werte`, Schreiben `/mietvertraege/[id]/indexerhoehung`; Regeln in `src/lib/indexmiete.ts`.

**Vertrag:** Die Wohnungsverträge sehen eine Indexmiete vor (Garagen nicht, siehe `docs/mietvertraege-mieter.md`): Miete folgt dem VPI für Deutschland, mindestens ein Jahr unverändert (Erhöhungen nach §§ 559/560 ausgenommen), Erklärung in Textform mit Indexänderung und Geldbetrag, neue Miete ab dem übernächsten Monat nach Zugang.

**Regeln der App**
- **Wartejahr:** Ausgangspunkt ist die letzte Änderung der **Kaltmiete** (`letzteKaltmietenAenderung`), sonst der Mietbeginn — reine NK-Anpassungen (`Mieterhoehung` mit unveränderter Kaltmiete) setzen das Jahr nicht zurück.
- **Basiswert:** `Mietvertrag.kaltmiete` ist der Stand **vor der ersten** erfassten `Mieterhoehung`; die Stufen darüber (`ermittleMieteFuerMonat`) liefern den geltenden. Stolperfalle: Steht in der Basis schon die aktuelle Miete und die letzte Stufe hat denselben Betrag, zählt die Stufe nicht als Kaltmieten-Änderung und das Soll früherer Monate ist zu hoch — dann die Basis auf den früheren Wert setzen und die Stufe behalten.
- **Basisindex (Variante C):** der bei der letzten Erhöhung **zugrunde gelegte** Index, sofern an der `Mieterhoehung` erfasst (Feld `indexMonat` „JJJJ-MM“ = „neuer“ Index des damaligen Schreibens; „Übernehmen“ füllt es automatisch, sonst unter „Mietvertrag bearbeiten“ → Mieterhöhungen), sonst der VPI des Monats der letzten Kaltmieten-Änderung bzw. des Mietbeginns **selbst**. Grund: Der Vertrag spricht vom „zum Zeitpunkt des Mietbeginns geltenden“ Index, und dieser Monat ergibt die niedrigste, angriffssicherste Miete aller Lesarten. Verworfen: Variante B (Vormonat, eigene Annahme ohne Beleg, etwas höhere Miete). Wurde die letzte Erhöhung nach einem anderen Index berechnet (Schreiben des Verwalters prüfen; Vergleichsmiete § 558 hat keinen Index), den Monat von Hand wählen bzw. nachtragen. Aus den Mieten lässt sich der damalige Index nicht rückrechnen. Die Schreiben des Verwalters zur letzten Erhöhung als Dokument am Mietvertrag ablegen.
- **Neue Kaltmiete** = Kaltmiete × neu ÷ Basis (`neueIndexmiete`), **standardmäßig auf volle Euro abgerundet** (zugunsten des Mieters; Aufrunden ginge über die Indexänderung hinaus). Im Schreiben abwählbar (dann cent-genau) oder von Hand überschreibbar; die Listen-Vorschau rechnet immer abgerundet.
- **VPI-Tabelle** `verbraucherpreisindex` (Jahr, Monat, Wert; Destatis 61111-0002, Gesamtindex, Basis 2020 = 100, alle Werte im selben Basisjahr). Import aus der Destatis-CSV per Skript, Platzhalter „…“ für unveröffentlichte Monate überspringen. Vor 2020 gibt es keine Werte (Liste „–“, im Schreiben Monat von Hand wählen oder ältere Werte nachtragen).

**Das Schreiben** nennt beide Indexwerte mit Monat, die Veränderung in %, bisherige/neue Nettokaltmiete mit Erhöhungsbetrag und die Gesamtmiete; bei Abrundung darunter den Rechenweg („590,00 € × 125,8 ÷ 113,7 = 652,79 €, zu Ihren Gunsten auf volle Euro abgerundet“) und die Quelle (Destatis). Die Einleitung folgt dem Klauselwortlaut. Das Formular zeigt die **Zugangsfrist** (§ 557b Abs. 3: Gültig ab 01.12. → Zugang bis 31.10.; `spaetesterZugang`/`fruehestensGueltigNachZugang`) und warnt, wenn das Briefdatum danach liegt — den Zugang nachweisbar machen (Einwurf-Einschreiben oder Bote mit Zeuge). „Übernehmen“ legt die neue Kaltmiete als `Mieterhoehung` ab „Gültig ab“ an (NK unverändert, gleicher Monat wird ersetzt) — erst nach dem Versand.

**Abgleich der Stufen mit dem Verwalter:** Seine E-A-Berichte nennen nur Jahressummen der Forderung Miete; Stufenmonat und -höhe lassen sich daraus ableiten (z.B. 3.810 € = 5 × 300 € + 7 × 330 € → Stufe 06/2024). Leseskript `scripts-tmp/erhoehungen-abgleich2.ts` vergleicht je Vertrag die Jahres-Kaltmiete der App mit der des Verwalters (nur Verträge, die zu Jahresbeginn liefen). Bei fehlenden Stufen zeigen auch die Journalzahlungen die Monatsmiete. Vorsicht: Verschiebt der Verwalter Kaltmiete und NK gegenläufig, bleibt die Summe gleich — ob die NK wirklich angepasst wurden, im Vertrag/Anpassungsschreiben prüfen, nicht raten. Änderungen am Basiswert verschieben das Soll früherer Jahre (Salden, Vorauszahlung der Abrechnung) — vorher Soll vor/nach zeigen.

**Mietrechtsreform (noch nicht in Kraft):** Regierungsentwurf BT-Drs. 21/6807: Ein neuer § 557b Abs. 4 BGB ließe den Anteil einer VPI-Steigerung über 3 % je Jahr nur zur Hälfte zählen — aber nur in Gebieten, die eine Landesverordnung als angespannt ausweist, und nur, wenn die Verordnung beim **Zugang** des Schreibens gilt. Eutin steht nicht in der Schleswig-Holsteiner Kappungsgrenzenverordnung. Vor jeder Indexerhöhung kurz prüfen, ob das Gesetz in Kraft ist und Eutin ausgewiesen ist (dann je Jahr rechnen; `neueIndexmiete` kennt das nicht).

## Anpassung der NK-Vorauszahlung

§ 560 Abs. 4 BGB. Liste „NK-Anpassung“ unter Stammdaten = `/mietvertraege/nk-anpassung` (alle aktiven Verträge mit Abrechnung: neueste Abrechnung, Kostenanteil (bei unterjähriger Nutzung „auf 12 Monate“ hochgerechnet) → Kosten/Monat, Vorauszahlung jetzt, Vorschlag, Änderung, „Angepasst“ = nach dem Abrechnungsjahr schon eine Mieterhöhung erfasst; Filter und Summenzeile, nichts gespeichert). „Erstellen“ öffnet `/mietvertraege/[id]/nk-anpassung`. Auf der Vertragsseite steht nur noch ein Link bei der neuesten Abrechnung (spart dort die Mandats-Abfrage).

- **Grundlage** ist immer die neueste Abrechnung. Endet der Vertrag bis zum Jahresende der Abrechnung, entfällt die Anpassung (Vertrag fehlt in der Liste, die Schreiben-Seite nennt den Grund). Ohne Kostenanteil (z.B. Platzhalter-Position) zeigt die Liste „–“ statt eines irreführenden Vorschlags von 0 €.
- **Vorschlag** (`src/lib/vorauszahlung-vorschlag.ts`, `STANDARD_ZUSCHLAG_PROZENT`) = Kostenanteil (bei unterjähriger Nutzung über `details[].anteilJahr` auf 12 Monate hochgerechnet) ÷ 12 plus Zuschlag, aufgerundet auf volle Euro (z.B. 1.234,56 € → 102,88 € → mit 3 % → 106 €).
- **Standard-Zuschlag 3 %** mit vorbelegter Begründung ist eine Entscheidung des Eigentümers — ein pauschaler Zuschlag ist nach BGH VIII ZR 294/10 angreifbar, deshalb steht die Begründung im Schreiben (bei konkretem Anlass diesen eintragen).
- **"Gültig ab"** = übernächster Monatserster, damit das Schreiben vor der nächsten Fälligkeit zugeht.
- **"Übernehmen"** legt eine `Mieterhoehung` mit unveränderter Kaltmiete an; gibt es im selben Monat schon eine, wird nur deren NK-Betrag ersetzt.

## Gemeinsames Anpassungsschreiben

Eine Komponente für beides: `Anpassungsschreiben` (`src/components/anpassungsschreiben.tsx`, Daten `ladeAnpassungsschreiben` in `mietvertraege/[id]/anpassung-laden.ts`). Die Listen „Mieterhöhung“ und „NK-Anpassung“ bleiben getrennt (verschiedene Voraussetzungen), ihr „Erstellen“ öffnet aber dasselbe Formular: `/indexerhoehung` startet mit dem Abschnitt „Indexerhöhung der Kaltmiete“, `/nk-anpassung` mit „NK-Vorauszahlung anpassen“; der andere Abschnitt lässt sich per Häkchen zuschalten (`?mitNk=1` bzw. `?mitIndex=1`), mindestens einer bleibt an.
- Beide Abschnitte zeigen ihr volles Formular; „Gültig ab“, Datum, Absender (im Browser gemerkt), Anrede und Zahlungsweg sind gemeinsam. Nicht verfügbare Abschnitte (kein Mietbeginn/VPI, keine Abrechnung, `nkAnpassungMoeglich`) sind abgeblendet und nennen den Grund.
- Das Schreiben passt sich an: nur Index, nur NK (Titel § 560 Abs. 4, Rechenweg) oder beides (beide Paragraphen, „1. Nettokaltmiete“ / „2. Betriebskostenvorauszahlung“, eine Gesamtmiete, ein Zahlungssatz; bleibt die NK unverändert, entfällt Abschnitt 2).
- „Übernehmen“ legt **eine** `Mieterhoehung` an: nur NK über `passeNkVorauszahlungAn`, sonst `uebernehmeIndexerhoehung` (optional mit `nebenkostenVorauszahlung`).

**Anrede** kommt aus `Mieter.anrede` (Frau/Herr/leer; nie aus dem Vornamen ableiten, im Zweifel leer). Ohne Anrede neutral "Guten Tag Vorname Nachname"; fehlt sie bei einem von mehreren Mietern, für alle neutral; Firmen ohne Anrede. Nachträglich setzen: `/mieter/anrede`.

**Zahlungsweg-Satz:**
- Lastschrift: „Die **Gesamtmiete** von … € ziehe ich erstmals mit der Lastschrift für <Monat Jahr> aufgrund des bestehenden SEPA-Lastschriftmandats (Mandatsreferenz …, Gläubiger-ID …) … ein“ — zugleich Vorabankündigung. „Für Dezember“ statt „ab dem 01.12.“, weil die Einzüge am 3.–7. laufen; „Gesamtmiete“ statt „den geänderten Betrag“ (missverständlich).
- Überweisung: „… die neue Gesamtmiete von … €“, mit Konto der Vermieterin aus `Objekt` (siehe `docs/mietvertraege-mieter.md`).
- Amt (`BEHOERDE`): Bitte um Weiterleitung ans Amt, keine Mandatsdaten.
- Mandatsreferenz und Gläubiger-ID vom Vertrag, sonst aus der jüngsten Bankzeile mit Mandat (`ladeLastschriftMandat`, `src/lib/lastschrift-mandat.ts`; Darstellung `MandatKlammer`, jeder Wert bleibt beim Umbruch zusammen). Die Abfrage läuft nur bei Lastschrift bzw. unbekanntem Zahlungsweg; fehlen die Daten, entfällt die Klammer und das Formular sagt es.

**Anschrift:** `Objekt.ort` = amtlicher Ort zur PLZ ohne Ortsteil („Eutin“).

**Eine A4-Seite:** Die Vorschau ist ein Blatt (`.druckbereich`, 297 mm; beim Indexschreiben unterer Rand 15 mm, Adressblock 32 mm). Jeder zusätzliche Textbaustein kostet Platz, sonst läuft die Unterschrift auf Seite 2 (Indexschreiben mit allen Bausteinen ≈ 11 mm Reserve, NK-Schreiben ≈ 22 mm, beide Abschnitte mit 10 pt kaum Reserve; ein Jobcenter-Satz ≈ zwei Zeilen, das Bankkonto ≈ eine). Nach Textänderungen im Browser messen: `.druckbereich` bleibt 297 mm hoch, Unterkante der Unterschrift ≤ 282 mm. Stolperfalle: Der Dev-Server übernimmt neue Tailwind-Klassen mit beliebigen Werten (`text-[9pt]`) zuweilen nicht — zum Messen die Regel per `<style>` ergänzen.

Nach dem Versand die PDF-Kopie in der Mieterakte ablegen (`docs/dokumente.md` → „Versandte Schreiben ablegen“).

## Layout „klar“ (alle übrigen Briefe)

Entscheidung 20.10.2026: bewusst schlicht. Verworfen: Georgia im Stil des Anpassungsschreibens (zu „schnörkelig“) und ein großer Briefkopf (Name stand doppelt). **Neue Schreiben nie frei gestalten.**

**Maße:** A4, **Arial 10,5 pt**, Zeilenabstand 1,25, Ränder links 25 mm / rechts 20 mm (DIN 5008), oben 15 mm, unten 20 mm.

**Aufbau von oben:**
- *Kein* Briefkopf. Das Anschriftfeld beginnt **49 mm** von oben (so steht es mittig im Fenster des Umschlags; bei Bedarf in `schreiben-pdf.ts` (`mm(34)` bei `let y = obenSeite - …`) und `schreiben-vorlage.js` (`mm(34)` vor `anschrift`) nachjustieren).
- Links die kleine Absenderzeile (7 pt, grau, unterstrichen: Name · Postfach · PLZ Ort der Vermieterin) und darunter der Empfänger („Herrn/Frau Vorname Nachname“, Straße, PLZ Ort). Rechts daneben der **Informationsblock** mit je einer Zeile „Etikett (klein, grau) – Wert“: Datum („Hamburg, TT.MM.JJJJ“), E-Mail, Telefon.
- **Betreff** (fett, 11,5 pt; 2. Zeile „Mietobjekt: Straße, PLZ Ort, Wohnung HS x WHG y“ in Grau), Anrede, Text mit fetten Zwischenüberschriften („1. …“), Tabellen, „Für Rückfragen stehe ich Ihnen gern zur Verfügung; meine Kontaktdaten stehen oben rechts.“, „Mit freundlichen Grüßen“, **58 pt Platz für die Unterschrift** (bei 34 pt lag sie auf dem gedruckten Namen), Name. Grußformel und Name hängen zusammen („Keep with next“) — rutschen sie auf Seite 2, Text kürzen statt den Abstand zu verkleinern.
- **Fuß:** Seite 1 links die Bankverbindung in einer Zeile (Name · Bank · IBAN · BIC; länger darf sie nicht werden, sonst bricht „Seite 1 von 2“ um), rechts „Seite x von y“; Folgeseiten nur die Seitenzahl. Nichts doppelt: Anschrift nur in der Absenderzeile, E-Mail/Telefon nur im Informationsblock.

**Angaben** kommen aus `Objekt` in der Produktion (nur lesend; vom Eigentümer gepflegt): Name/Anschrift aus `sepaGlaeubigerName/-Anschrift` (steht ohne Trennzeichen, z.B. „Postfach 13036820103 Hamburg“ → `zerlegeAbsenderAnschrift` macht „Postfach 130368 · 20103 Hamburg“), `telefonMieter`, `emailMieter` (nicht `emailVerwaltung`), `mietkontoInhaber/-Iban/-Bic/-Bank`. Straßennamen schreibt der Brief wie in den Stammdaten („Breslauer Str. 10“, Wohnung „HS x WHG y, Lage“) — Tippfehler dort korrigieren, nicht im Brief; nur ASCII-Umschreibungen der Stammdaten („Koenigsberger Strasse“) schreibt der Brief mit Umlauten.

**Tabellen:** ohne Gitter, Zeilen durch helle Linien getrennt, Beträge rechtsbündig mit „€“ und Dezimalkomma, Summenzeilen fett mit schwarzer Linie, mehrspaltige mit grauer Kopfzeile; Minus als „− 1.050,00 €“.

**Sprache:** Sie-Form, Absenderin in der **Ich-Form**, sachlich-freundlich; Beträge immer mit Cent; Fehler Dritter ohne Namen („die bisherige Hausverwaltung“). Briefdatum, Frist (Standard 14 Tage), Unterschrift und Mieteranschrift (steht nicht in der DB) mit dem Eigentümer absprechen, nicht raten.

**Zwei Wege, dasselbe Layout:**
- **PDF aus der App/aus `tsx`-Skripten:** `erzeugeSchreibenPdf` (`src/lib/schreiben-pdf.ts`, Bausteine `absatz`/`ueberschrift`/`tabelle`, `anlage` für eine eigene Seite nach der Unterschrift). **Weitere Schreiben damit bauen, nicht neu setzen.** Schrift: Arimo (Arial-metrisch, OFL) als Base64 in `src/lib/schreiben-schrift.ts` (aus `@fontsource/arimo`, braucht `@pdf-lib/fontkit`) — **nicht** Helvetica (macOS-Vorschau stellt deren €-Zeichen breiter dar, `pdftoppm` ersetzt Helvetica-Bold durch normal). Seitenumbruch: Absätze werden nicht geteilt, Tabellen bis 10 Zeilen bleiben zusammen, längere brechen um (Kopfzeile wiederholt, Summenzeile bleibt bei den zwei Zeilen davor). Lange Empfängernamen (Firmen) brechen in der Anschriftspalte um. PDFs mit Standardschriften ansehen: `node scripts-tmp/pdf-seiten.mjs <pdf> <ordner> [dpi]` (über `sips`).
- **Word/PDF per Skript-Vorlage:** `scripts-tmp/schreiben/schreiben-vorlage.js` (nicht im Git, nur im Hauptordner; `docx` in `scripts-tmp/schreiben/node_modules`; kapselt `erstelle`, `absatz`, `ueberschrift`, `tabelle`, `**fett**`, Option `anhang` für Anlagen nach der Unterschrift; Tabellen trennen sich nicht über Seiten, sondern rutschen samt Überschrift auf die nächste). Beispiele im selben Ordner; `schreiben-vorlage-georgia.js` und die erste Zahlungserinnerung mit Gitter-Tabellen sind der alte Stil — nicht verwenden. `node <skript>.js` schreibt die `.docx`; das PDF entsteht über Pages (`open -a Pages`, dann AppleScript `open … / export d to POSIX file "….pdf" as PDF`; Pages muss laufen, sonst „-600“; LibreOffice fehlt, Words `save as` ging nicht). Seiten ansehen mit `pdftoppm -jpeg -r 80`. Pages rückt Tabellenzellen minimal ein.
- **Ausgabe** nur in `scripts-tmp/schreiben/` (git-ignoriert, Personendaten), Dateien dem Eigentümer mit `SendUserFile` schicken. Nach dem Versand legt er die Kopie in der Mieterakte ab (Art `SCHREIBEN`).

## Betriebskostenabrechnung als Schreiben (PDF)

Je Mietvertrag ein Brief im Layout „klar“, PDF reicht. Ein Generator, zwei Wege:
1. Abrechnungsseite → „Schreiben an die Mieter (PDF)“ = `/nebenkostenabrechnungen/[id]/schreiben`: Briefdatum, Zahlungsfrist (Standard heute + 14 Tage), je Zeile „PDF“, Häkchen-Auswahl oder alle als **eine** PDF. Route `/api/nebenkostenabrechnung/schreiben?abrechnung=&mietvertrag=&datum=&frist=` (nur lesend, auch Gäste, rechnet nur beim Klick; rund 70 Schreiben ≈ 5 s).
2. Skript `scripts-tmp/nk-schreiben.ts <Jahr> <Suchtext|alle> <Datum JJJJ-MM-TT> [Frist|-] [Ausgabe.pdf]` (nur lesend; `ANSCHRIFT="Straße;PLZ Ort"` setzt die Anschrift eines ausgezogenen Mieters).

Aufbau: `ladeNkSchreiben` (`src/lib/nk-schreiben-laden.ts`, DB) → `baueNkSchreiben` (`src/lib/nk-schreiben.ts`, reine Funktion) → `erzeugeSchreibenPdf`.

**Inhalt** (Textbausteine vom Eigentümer am 23.10.2026 abgenommen):
1. Ergebnis (Anteil − Vorauszahlung = Nachzahlung/Guthaben).
2. Berechnung als Tabelle je Kostenart (Gesamtkosten, Verteilung „41,44 von 2.673,534 m²“, Ihr Anteil); kalte und warme Kosten getrennt (`istWarmeKostenart`, `src/lib/kostenart-warm.ts`) mit je einer Zwischensumme aus den gerundeten Zeilen (`zwischen: true`); extern vorverteilte Kosten „gesondert abgerechnet“; Wohnfläche als Satz; bei unterjähriger Mietzeit ein Satz zu den Tagen. Weicht die Summe der gerundeten Zeilen um 1 Cent vom Kostenanteil ab (Restcent-Ausgleich), erklärt ein Satz „Differenz … beruht auf Rundungen“.
3. Vorauszahlungen und Zahlung: Nachzahlung mit Frist, Konto der Vermieterin, Verwendungszweck „Betriebskosten 2025 HS 2 WHG 4“ (eine Lastschrift wird bewusst nicht erwähnt); Guthaben per Überweisung auf das Konto der Mietzahlungen; bei Zahlungsweg Amt ein Hinweis auf Jobcenter/Sozialamt. Ist die Vorauszahlung nicht voll gezahlt, steht die Gegenrechnung da („Vereinbart waren … die nicht gezahlten … sind mit dieser Abrechnung ausgeglichen“, `unbezahlteNkVorauszahlung`).
4. Belegeinsicht nach Terminabsprache, Einwendungsfrist zwölf Monate (§ 556 Abs. 3 BGB).
- Wohnung mit Lage in der zweiten Betreffzeile (Teil der Einheit-Bezeichnung nach „ - “, `wohnungLage`).
- Anlage Arbeitskosten (§ 35a, siehe unten) als eigene Seite.

**Grenzen:** Nur berechnete Positionen (`details` gesetzt; manuelle 2021–2024 haben keine Aufschlüsselung und werden übersprungen). Ausgezogene Mieter bekommen „[neue Anschrift ergänzen]“. Schon gebuchte Auszahlungen/Verrechnungen sind nicht berücksichtigt — das Schreiben ist für die Zeit vor dem Versand. Nach dem Versand die Kopie ablegen und „Als versendet markieren“ setzen.

## Arbeitskosten-Ausweis (§ 35a EStG)

Wie beim Vorverwalter bekommt die Abrechnung eine Anlage „Ausweis der haushaltsnahen Dienstleistungen“ (Rechnungsbetrag brutto, davon Arbeitskosten, Anteil des Mieters) mit einem neutralen Satz zu § 35a ohne Prozentsätze oder Beratung; im Brief ein Verweis darauf.

- **Je Kostenposition gespeichert** (Tabelle `buchung_arbeitskosten`, `BuchungArbeitskosten`: `betrag` = Lohn inkl. Umsatzsteuer, ohne Material und Fahrtkosten, Vorzeichen wie die Position, höchstens so groß wie sie). Eingabe auf der Detailseite der Kostenposition unter „Arbeitskosten (§ 35a EStG)“ (`ArbeitskostenBox`, `speichereArbeitskosten`, nur bei beleg-pflichtigen Positionen, kein `revalidatePath`; leer = entfernen). Beim Ersetzen per Storno anteilig mitnehmen (`uebernehmeArbeitskosten`; geänderter Betrag ändert den Anteil proportional, bei Bedarf korrigieren).
- **Ab 2026 je Rechnung; für 2025 die Zahlen des Vorverwalters** (nur Hauswart, 90 % je Rechnung): Skript `scripts-tmp/p35a-uebernehmen.ts hauswart 90 2025 [--write]` (ohne `--write` Trockenlauf). Gegen die Produktion zuerst den Trockenlauf zeigen, `--write` nur mit ausdrücklicher Freigabe.
- **Anlage nur bei vollständiger Erfassung:** Eine Kostenart erscheint nur, wenn **alle** ihre beleg-pflichtigen Positionen des Kostenjahres eine Angabe haben (0 € erlaubt; `ladeArbeitskostenStand`); Kostenarten ohne jede Angabe gelten als nicht begünstigt. Quote = Summe Arbeitskosten ÷ Summe Rechnungsbeträge der Kostenart (über alle Kostenkreise), Mieteranteil = Kostenanteil × Quote (`berechneArbeitskostenZeilen`, `nk-schreiben.ts`; extern vorverteilte Techem-Kosten weist Techem selbst aus).
- Die Seite „Schreiben“ der Abrechnung zeigt den Erfassungsstand je Kostenart („erscheint“/„unvollständig – fehlt bei N“).
- **Offen:** welche weiteren Kostenarten begünstigt sind (Hauswart sicher, Garten/Winterdienst/Treppenhaus stecken darin; Dachrinne, Schornsteinfeger u.ä. sind Handwerkerleistungen bzw. laufen über Techem — mit dem Steuerberater klären) und ob eine Trennung haushaltsnahe Dienstleistungen/Handwerkerleistungen nötig wird.

## Mahnung, Korrekturschreiben und Kündigung bei Zahlungsverzug

Entscheidung 23.10.2026 aus einem Fall mit Rückstand und zu niedrig angesetzter Vorauszahlung in der versendeten Abrechnung.

**Ablauf**
1. **Korrekturschreiben** zur NK-Abrechnung, wenn sie die Vorauszahlung zu niedrig ansetzte (Korrektur zugunsten des Mieters ist unkritisch; die Ausschlussfrist des § 556 Abs. 3 gilt nur für Nachforderungen). Danach die Position „Neu berechnen“ und prüfen, ob das Versanddatum auf das der Korrektur gesetzt wird (bestimmt, ab wann die Gutschrift der unbezahlten NK-Vorauszahlung zählt).
2. **Mahnung** mit Frist (14 Tage) und Androhung der fristlosen Kündigung, am besten im selben Umschlag. Rechtlich nicht nötig (§ 543 Abs. 3 Satz 2 Nr. 3 BGB), belegt aber Verzug und ist die letzte Frist — wer eine Frist setzt, kündigt nicht davor.
3. **Kündigung** (fristlos, hilfsweise ordentlich) nach Fristablauf.

**Erzeugen:** als Word und PDF mit fallbezogenen Skripten in `scripts-tmp/schreiben/` (nicht im Git; für einen neuen Fall kopieren und Vertrags-ID/Anschrift/Texte anpassen): gemeinsame Zahlenbasis aus Leseskripten (Mieterkonto je Jahr mit `baueMieterkontoJahr`; Position, Kostenarten mit warm-Kennzeichen, Arbeitskosten-Quote) als JSON, dazu je ein Skript für Anlage Mieterkonto, Mahnung, Korrektur, Kündigung auf Basis von `schreiben-vorlage.js`. Die Skripte rechnen die Vorauszahlung selbst nach und vergleichen sie mit der gespeicherten Position (Warnung „Position muss neu berechnet werden“), und sie brechen ab, wenn Text und Zahlen nicht mehr passen (z.B. Rückstand unter zwei Monatsmieten).

**Zahlen**
- Rückstand = offene Monate (Soll je Mietperiode − Zahlungen) − Gegenrechnung (NK-Soll des Jahres − Vorauszahlung der Abrechnung); Gesamt = Rückstand + Nachzahlung (+ Gebühr), muss dem Mieterkonto der App entsprechen.
- Die **Aufteilung** zwischen Rückstand und Nachzahlung hängt an der Tilgungsreihenfolge (`docs/zahlungen-kautionen.md`): Beispiel mit „NK zuerst“ Rückstand 1.280 € + Nachzahlung 270,95 €, anteilig und mit auf die ältesten Monate umgebuchten Rückstandszahlungen 1.443 € + 107,95 € — Gesamt 1.550,95 € in beiden Fällen. Zahlungen auf Rückstände ohne Monat vorher per Storno + Neuanlage auf die ältesten offenen Monate legen.

**Kündigung**
- Grund sind nur **Monatsmieten** (Kalt + NK-Vorauszahlung), **nicht** die NK-Nachzahlung oder Gebühren. § 543 Abs. 2 Satz 1 Nr. 3 BGB: (a) zwei aufeinanderfolgende Termine mit mehr als einer Monatsmiete (§ 569 Abs. 3 Nr. 1) oder (b) Rückstand, der zwei Monatsmieten **erreicht**, über mehr als zwei Termine.
- Der Rückstand muss beim **Zugang** noch bestehen — eine Teilzahlung kann ihn unter die Schwelle drücken. Deshalb direkt nach Fristende kündigen und am Versandtag neu rechnen (die Miete des Folgemonats ändert den Rückstand).
- Förmlich: Schriftform, die **Vermieterin unterschreibt eigenhändig** (sonst Originalvollmacht, § 174 BGB), Einwurf-Einschreiben **und** Bote mit Zeugen, an **alle** Mieter im Vertrag (Mieterdaten vorher prüfen — einmal stand ein Mitbewohner als zweiter Mieter am Vertrag). Hilfsweise ordentliche Kündigung mit Hinweis auf das Widerspruchsrecht (§ 574b), Widerspruch gegen stillschweigende Verlängerung (§ 545), Räumungsfrist, Nutzungsentschädigung. Entwürfe vor dem Versand juristisch prüfen lassen.
- Eine Kündigung lässt sich nicht einseitig „zurücknehmen“ — eine Fortsetzung braucht eine neue Vereinbarung.
- **Ratenzahlung:** Jede Zusage von Raten oder Stundung (auch telefonisch) kann die Kündigung gefährden; Teilzahlungen werden „ohne Zustimmung zu einer Ratenzahlung oder Stundung“ angerechnet, der Verwendungszweck „Rate Rückstand“ wird nicht zitiert.

**Anlagen**
- **Anlage Mieterkonto:** eine Zeile je Monat (Soll, Zahlungen mit Datum, laufender Saldo, Gutschrift am Versanddatum der Abrechnung), dazu „n von m Monaten“ ohne volle Zahlung bis zum 15. (großzügiger als der 3. Werktag). Frühere Jahre bleiben draußen, wenn eine Sammelzahlung dort Guthaben und Rückstände vermischt.
- **Korrekturschreiben:** Anlage 1 ist die komplette korrigierte Abrechnung im Aufbau des Betriebskostenschreibens, danach Arbeitskosten-Anlage und Anlage Mieterkonto.
- **Mahngebühr:** 5 € als Sonderforderung `MAHNGEBUEHR` (Zahlungen → Neu → Gebühr, Datum der Mahnung), in den Schreiben als eigene Zeile, **nicht** Teil des Mietrückstands und kein Kündigungsgrund. Anerkannt werden meist nur Beträge im niedrigen einstelligen Eurobereich.

## Schreiben an die Garagenmieter

Entscheidung 04.11.2026: Betriebskosten 2025, Umsatzsteuer-Erstattung, neue Verträge. Ein Brief je Mieter (mehrere Garagen desselben Mieters in einem Brief), PDF im Layout „klar“; Skript `scripts-tmp/garage-schreiben.ts [Briefdatum] [Frist in Tagen]` (nur lesend; Ausgabe `scripts-tmp/schreiben/Garagen/`: Einzel-PDFs und Sammel-PDF).

**Inhalt**
**Umlage nur bei klarer Vertragsklausel.** Abschnitt 1 und 2 (Abrechnung, „Warum erst jetzt“) stehen nur in Briefen an Mieter, deren Vertrag die Umlage klar vorsieht (Garagen 1, 2, 5, 7, 8; Zuordnung `UMLAGE_PARAGRAPH` im Skript, Befund: `docs/mietvertraege-mieter.md` → „Betriebskosten im Vertrag“). Bei Garagen ohne Klausel (3, 6, 9) und mit nur eingeschränkter Klausel (4) wird nichts abgerechnet und die Umlage nicht erwähnt; Mieter mehrerer Garagen bekommen die Abrechnung nur für die Garagen mit Klausel. Der Schlüssel bleibt gleich durch 10, der Anteil der übrigen Garagen trägt die Vermieterin.

1. Abrechnung 2025 als Tabelle je Kostenart (Anteil = Kosten ÷ 10 × Monate/12; Zahlen und Strom nach Verbrauchsjahr: `docs/nebenkosten.md` → „Betriebskosten der Garagen“). Die Klausel wird mit Paragraph genannt (§ 3 Nr. 3, bei Garage 7 Nr. 2). Keine Vorauszahlung vereinbart, also volle Nachzahlung.
2. „Warum erst jetzt“: Umlage steht im Vertrag, die bisherige Hausverwaltung hat nie abgerechnet, nach dem Verwalterwechsel wurden die Verträge durchgesehen; ausdrücklich **kein Verzicht** auf die Umlage. Keine Position zu den Vorjahren.
3. Nur bei Verträgen mit Umsatzsteuer: Erstattung der seit 2023 gezahlten Umsatzsteuer (Kleinunternehmer, `docs/mietvertraege-mieter.md`), **verrechnet mit der Nachzahlung** (falls vorhanden), Rest per Überweisung (Standard Briefdatum + 14 Tage) auf das Konto der Mietzahlungen; ab Dezember 2026 Miete ohne Umsatzsteuer (bei Lastschrift zugleich Vorabankündigung).
4. Neue Verträge ab 01.01.2027 mit Betriebskostenpauschale (Höhe folgt mit dem Entwurf, braucht Zustimmung; bis dahin gilt der alte Vertrag). Mieter ohne Umlageklausel bekommen nur diesen Abschnitt (und ggf. die Erstattung); die Abschnittsnummern passen sich an.
Mieter ohne Umsatzsteuer überweisen die Nachzahlung bis zur Frist.

**Vor dem Versand**
- Mieteranschriften stehen nicht in der DB (Platzhalter).
- Die Erstattungsbeträge sind ein Lesestand aus den Zahlungen — mit dem Kontoauszug abgleichen (einmal lagen Fremdbuchungen als Mietzahlung auf einer Garage; Sammelbeträge prüfen).
- Die Abrechnung 2025 muss bis 31.12.2026 zugehen (Einwurf-Einschreiben oder Bote mit Zeuge).
- Vertragswerte (Mehrwertsteuer 9,50 € → 0) und Lastschriften vor dem Dezember-Einzug umstellen (offen, siehe `docs/mietvertraege-mieter.md`).
- Entscheidung: keine anwaltliche Prüfung (Risiko vor allem bei den Vorjahren, die der Brief nicht erwähnt). Der Steuerberater hat Erstattung und Miete ohne Umsatzsteuer bestätigt.
