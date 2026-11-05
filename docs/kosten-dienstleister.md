# Kosten, Kostenarten und Dienstleister

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Versorger-Salden (Stadtwerke Wasser/Abwasser)

Die Stadtwerke verrechnen die Schlussrechnung (SR) des Vorjahres mit den neuen Abschlägen und ziehen **pro Haus (Kundennummer) nur einen Saldo** ein. Das Journal des Verwalters (Konto 4250) zeigt dagegen vier Zeilen (Wasser SR, Abwasser SR, Abschlag Wasser, Abschlag Abwasser), z.B. +70,62 + 143,50 − 111,00 − 60,00 = +43,12 € Gutschrift. Einzelbeträge findet man deshalb nur über Summe/Kundennummer.

- **Erfassung:** Saldo als eine `KOSTENPOSITION` importieren und in die vier Teile **aufteilen** (Kosten → Position → "Auf mehrere Kostenarten aufteilen…"). Vorzeichen der Kostenposition umgekehrt zum Verwalter-Konto: −70,62 / −143,50 (SR-Guthaben) / +111,00 / +60,00 = −43,12 €. Das Aufteilen erlaubt gemischte Vorzeichen und ein Kostenjahr je Teil: SR-Teile bekommen das Vorjahr.
- Für die NK-Abrechnung bringt die Aufteilung nichts (die Kostenart „Wasser/Abwasser (über Techem verrechnet)“ hat den Schlüssel `IN_ABRECHNUNG_ENTHALTEN`); sie spiegelt das Journal des Verwalters und gibt den SR-Teilen das Vorjahr.
- Stolperfalle: Der Verwendungszweck nennt oft die falsche Sparte ("Allgemeinstrom + Wasser"), obwohl der Betrag reines Wasser/Abwasser ist — Kostenart am Betrag prüfen, nicht am Text.
- Die Abbuchung einer Jahresabrechnung ist meist **Saldo + erster neuer Monatsabschlag** (z.B. Nachzahlung 80,66 € + Abschlag 189 € = 269,66 €).
- Beleg zur Abbuchung (Jahresabrechnung, Erkennung von Kundennummer und Salden): `docs/dokumente.md` → „Versorger-Abrechnungen“.

## Grundsteuer-Quartalsrate der Stadt

Die Stadt bucht je Haus-Gruppe eine Rate ab, die aus Grundsteuer und Straßenreinigung besteht (z.B. 346,55 € = 293,45 € Grundsteuer + 53,10 € Straßenreinigung; in jedem Quartal gleich). Entscheidung: Jede Abbuchung wird in zwei Kostenpositionen **aufgeteilt** — Grundsteuer am Haus (Kostenkreis Haus), Straßenreinigung ohne Gebäude (objektweit, wie beim Vorverwalter Konto 4290). Ungeteilt würde die Straßenreinigung nur den Mietern des Hauses als Grundsteuer angerechnet. Die Garagen-Rate bleibt eine Position der Kostenart "Straßenreinigung & Grundsteuer Garagen" (nicht umlagefähig). Der Vorverwalter teilt unregelmäßig — die Summe je Quartal stimmt trotzdem.

## Hauswart und Winterdienst

- **Entscheidung 02.11.2026:** Rechnungen des Hausmeisterdienstes (Hausmeister, Treppenhaus, Garten, Winterdienst) werden ab 2026 einheitlich unter **„Hauswart“** (umlagefähig) gebucht, auch eine separate Winterdienst-Zeile. Damit entfällt das Aufteilen gemischter Rechnungen, an dem 2025 ein Fehler entstand.
- Die Kostenart „Winterdienst“ (nicht umlagefähig) bleibt nur wegen einer Buchung 2025 bestehen und wird nicht mehr verwendet. Diese Rechnung (535,50 €) blieb in der abgeschlossenen Abrechnung 2025 unberücksichtigt und trägt der Eigentümer — nicht geändert.
- **Mietvertrag** (Muster der Wohnungsverträge ab 2026): § 4 nennt „Straßenreinigung, Schnee- und Eisbeseitigung“ als Betriebskosten, § 7 Nr. 2 „Hausreinigung, Winterdienst, Gartenarbeit“ als Leistungen des Vermieters; Schneeräumen durch Mieter (§ 29) gilt nur bei Übertragung nach Plan (nicht vereinbart). Winterdienst ist damit umlagefähig (BetrKV Nr. 8); die Abrechnung kann „Hauswart (inkl. Winterdienst)“ heißen.
- **Offen (Rechtsfrage):** Die Aufzählung in § 4 nennt Hauswart, Hausreinigung (Treppenhaus) und Gartenpflege nicht einzeln, nur der Verweis auf die BetrKV und § 7 Nr. 2 decken sie ab. Ob die Aufzählung abschließend gelesen werden kann (Unklarheit zulasten des Vermieters), mit Mietrechtler/Verband klären (Hauswart ≈ 30.000 €/Jahr) und bei neuen Verträgen „Hausmeister, Hausreinigung, Gartenpflege“ ergänzen. Hinweistext auf der Kostenarten-Seite.

## Heizungswartung über Techem

Die Kostenart "Wartungsarbeiten Heizung (über Techem verrechnet)" ist **umlagefähig mit dem Schlüssel `IN_ABRECHNUNG_ENTHALTEN`** — bewusst: Techem verrechnet die Wartung in der Heizkostenabrechnung, die App erfasst sie nur als Kosten. Dadurch läuft sie nicht in die Nebenkostenabrechnung (dort nur der Hinweis „Bereits in der Techem-Abrechnung … enthalten“) und kann nicht doppelt umgelegt werden. Rechnungen des Heizungsbauers (Wartung + Reparatur) werden aufgeteilt: Wartungsanteil auf diese Kostenart, Reparatur auf "Reparaturen" (nicht umlagefähig). Der Vorverwalter bucht alles als nicht umlagefähig — Summe gleich, Aufteilung anders.

## Anwalts- und Gerichtskosten

Eigene Kostenart „Rechts- und Prozesskosten“, **nicht umlagefähig** (keine BetrKV-Kosten). Zugeordnet der betroffenen **Einheit**, wenn das Verfahren eine konkrete Wohnung betrifft (z.B. Klage gegen einen Mieter), sonst dem Gebäude; ohne Mietvertrag; Kostenjahr = Abbuchungsjahr (Werbungskosten nach Abfluss). Die Kanzlei steht als Dienstleister (Typ Sonstige) mit Suchbegriff und genau dieser Kostenart, damit der Import weitere Rechnungen zuordnet. Erstattet der Gegner Kosten, als negative Kostenposition derselben Kostenart buchen.

## Handwerker & Dienstleister

Stammdaten `/dienstleister` (Tabelle `Dienstleister`, Logik `src/lib/import/dienstleister.ts`, `src/lib/dienstleister-vorschlaege.ts`): primär ein Kontaktverzeichnis (Beschreibung, Ansprechpartner, Telefon, E-Mail, Adresse, Notiz), Typ `HANDWERKER` oder `SONSTIGE` (Versorger, Verwaltung, Versicherung).

**Zuordnung im Kosten-Import** (`mapKostenRows`): Ein Suchbegriff (im Empfänger oder Verwendungszweck; Empfänger-Treffer vor Zweck-Treffer, längster Begriff gewinnt) ordnet die Zeile dem Dienstleister zu. Der Treffer hat Vorrang vor der aus der Historie gelernten Kostenart: genau **eine** Kostenart am Dienstleister wird fest vorgeschlagen; bei **mehreren** bleibt der Verlaufs-Vorschlag nur, wenn er darunter liegt, sonst bleibt die Zeile offen. Suchbegriffe sind optional (ohne = reiner Kontakt).
- Stolperfalle: Der Abgleich ist ein **Teilstring-Treffer** nach `normalizeText` (Kleinschreibung, Umlaute/ß aufgelöst, nur Buchstaben und Ziffern) — Schreibvarianten brauchen eigene Suchbegriffe (ein Begriff mit einem „l“ trifft keine Schreibweise mit zwei).
- Ohne Dienstleister-Treffer vergleicht der Verlaufs-Vorschlag den Empfängernamen **exakt**: Wechselt ein Betrieb den Auftritt auf dem Kontoauszug (Inhaber- → Firmenname), zählt das als neuer Empfänger.
- `aktiv` heißt nur "wird aktuell genutzt" (Inaktive grau am Tabellenende); die Import-Zuordnung greift bewusst auch bei Inaktiven (ältere Kontoauszüge).

**Weiteres**
- Verträge liegen als `Dokument` mit `dienstleisterId`; Upload-Limit 1 MB (`MAX_DOKUMENT_GROESSE_BYTES` in `upload-limits.ts`; komprimierte Scans reichen).
- **Verwalterwechsel:** `Dienstleister.verwaltungInformiertAm` hält fest, dass der Dienstleister über die neue Verwaltung informiert wurde. Liste: anklickbare Spalte „Verwalterwechsel“ (grün mit Datum = informiert, grau gestrichelt = offen; `setzeVerwaltungInformiert`), Formular mit genauem Datum, neben dem Abschnittstitel die Zahl der offenen aktiven Einträge. Nur diese **eine** Markierung, reine Erinnerung — eine Kündigung des Dienstleisters selbst ist `aktiv`/inaktiv (verworfen: Feld „Vertrag gekündigt am“).
- Die Vorschlagsliste auf der Seite leitet Kandidaten aus den Kostenbuchungen ab (Empfänger ≥ 2 Buchungen, noch nicht zugeordnet, kein Mieter; Kostenarten ab 10 % Anteil).

## Leerstand-Seite

`/leerstand`: je **Leerstandszeitraum** eine Karte (Wohnung, Zeitraum, Vormieter, ggf. Nachmieter ab, Stromkundennummern, Abbuchungen mit Summe), Filter „Alle / Jetzt leer / Frühere Leerstände“ (`?ansicht=`), ab **01.01.2025** (`LEERSTAND_AB` in `src/lib/leerstand.ts`).

- **Leerstand** = Zeit **ohne Mietvertrag** zwischen zwei Verträgen oder nach dem letzten (Lücke ab einem Tag; Ende 30.06./Beginn 01.07. ist keiner), nur aus den Vertragsdaten. **Garage 10 ist ausgenommen** (Eigennutzung, `LEERSTAND_AUSGENOMMEN`). Eine Wohnung kann mehrmals erscheinen. Eine Wohnung ohne eingetragenes Vertragsende erscheint erst nach Erfassung des Endes.
- **Kundennummern** stehen nirgends als Feld, sie werden aus dem Verwendungszweck der Buchungen der Kostenart „Leerstandkosten Strom“ gelesen (`kundennummerAus`: „KD …“, „KN …“, „Kd.Nr.“, „Kunden Nr./N.“, „Kundennummer“, „Vertragskonto“; Rechnungsnummern bewusst nicht).
- **Zuordnung der Buchungen:** alle Buchungen einer Kundennummer zu einem Zeitraum (dem der frühesten Buchung — so landet die Gutschrift der Schlussrechnung beim richtigen Leerstand); ohne Nummer nach Datum (zuletzt begonnener Zeitraum, sonst der nächste); Buchungen **nur mit Gebäude** in den einzigen passenden Zeitraum des Gebäudes (92 Tage davor bis 120 Tage danach), gekennzeichnet „nur dem Gebäude zugeordnet“.
- **Kasten „Nicht zuordenbare Leerstandskosten“:** Strombuchungen ohne passenden Zeitraum (mit Grund) und noch nicht kategorisierte Importzeilen mit „Strom“/„Leerstand“/„Stadtwerke“ im Text.
- **Hinweise auf der Karte:** Buchungen vor dem Leerstandsbeginn tragen „vor Leerstandsbeginn“ (Vertragsende prüfen oder Buchung falsch zugeordnet); mehrere Kundennummern in einem Zeitraum lösen eine Warnung aus (kann ein Kontowechsel bei den Stadtwerken sein: altes Konto abgerechnet, neues angelegt).

**Wissen zu den Stadtwerken (Auskunft 03.11.2026):**
- Nicht jede Stadtwerke-Nummer ist Leerstand: Allgemeinstromzähler der Häuser gehören als „Allgemeinstrom“ aufs Gebäude, nicht auf „Leerstandkosten Strom“; solche Importzeilen bleiben im Kasten, bis sie gebucht sind. Was bei anderen Lieferanten auf den Eigentümer angemeldet ist, kennen die Stadtwerke nicht.
- Ein Leerstandskonto wird mit Anmeldung angelegt; die Nummern wachsen mit der Zeit — eine Nummer kurz nach einem Mietende deutet auf einen neuen Leerstand hin.
- **Abschläge ohne Einzug:** Für Leerstandskonten liegt keine Bankverbindung vor; die Verwaltung überweist die Abschläge einzeln (kein Dauerauftrag). Nach einer Abrechnung/Abmeldung (Einzug eines Mieters, Lieferantenwechsel) keine Abschläge mehr zahlen — ein weiter gezahlter Abschlag bleibt sonst als Guthaben stehen und wird nur gegen mitgeteilte Bankverbindung ausgezahlt. Das Guthaben als Gutschrift buchen (negative Kostenposition „Leerstandkosten Strom“, gleiche Wohnung). Den genauen Abrechnungszeitraum nennt nur die Schlussrechnung; bei widersprüchlichen Daten mit der Kundennummer bei den Stadtwerken nachfragen.
- Stolperfalle: Eine Buchung kann am Gebäude einer anderen Wohnung hängen (Kundennummer passt zu einer anderen Hausnummer) — im Zweifel Kundennummer mit dem PDF vergleichen und umbuchen.
