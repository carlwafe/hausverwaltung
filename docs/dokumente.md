# Dokumente (Ablage, Erkennung, Zuordnung, Belegprüfung)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Aufbau der Ablage

`/dokumente`, Tabelle `dokumente`, Loader `src/lib/dokumente-uebersicht.ts`, Anzeige-Helfer ohne Prisma in `src/lib/dokumente-anzeige.ts`. Gäste sehen alles, ändern nichts.

**Keine Ordnertabelle — Ordner ergeben sich aus den Bezügen.** Ein Dokument kann **mehrere Bezüge** haben (Kostenposition, Mietvertrag, Einheit, Haus, Gebäude, Dienstleister, Ticket — je Art einer) oder keinen.
- **Bereiche** (`BEREICHE`) sind nur Ansichten: Eingang, Mieterakten, Einheiten, Häuser, Gebäude, Kostenbelege, Dienstleister, Tickets, Unkategorisiert. Ein Dokument erscheint in jedem Bereich, zu dem es einen Bezug hat. „Mieterakten“ statt „Mietverträge“, weil dort alles zum Mietverhältnis liegt.
- **Unterordner** = das Bezugsobjekt; Kostenbelege je Kostenjahr (Datum der Buchung, sonst `jahr`).
- Nur Dokumente **ohne Bezug** („Unkategorisiert“, Schlüssel `allgemein`, z.B. Versicherung, Grundbuch) tragen einen frei benannten Ordner in `Dokument.ordner` (max. 80 Zeichen, leer = „Ohne Ordner“, in der Tabelle änderbar). Beim Upload schlägt das Feld „Ordner“ per Datalist die vorhandenen Ordner plus `ORDNER_VORSCHLAEGE` vor (verworfen: Knöpfe/Chips, wirkten verwirrend). Ein Ordner entsteht erst mit dem ersten Dokument.

**Hauptordner** (`HAUPTORDNER` in `dokumente-anzeige.ts`, Variante „nach Verwendung“; leere werden ausgeblendet):
- **Eingang**;
- **Kosten** („Je Kostenjahr“ mit Dokumenten mit Kostenposition **und** abgelegten Rechnungen/Bescheiden/Abrechnungen ohne Position, Jahr = Kostenjahr bzw. Belegdatum, sonst „Ohne Jahr“; „Je Dienstleister“);
- **Mietverhältnisse** (je Mietvertrag, Filter „Mietverhältnis: Alle / Laufend / Beendet“, `?status=aktuell|beendet`; „Laufend“ = alles außer beendet; beendete Ordner stehen gedimmt dahinter, in der Gesamtliste mit „(beendet)“ am Bezug, über die Suche findbar);
- **Objekt** (je Haus, Gebäude, Einheit, „Nach Art“: Versicherung, Prüfbericht/Gutachten, Steuer/Behörde);
- **Sonstiges** (Tickets, frei benannte Ordner).

Die Gruppenseiten laden `?gruppe=kosten|objekt|sonstiges`; ein Dokument kann in mehreren Hauptordnern stehen. Weitere Ansichten: **Nach Typ** (`?ansicht=typ&art=…`, „Ohne Typ“ = `_ohne`) und **Alle Dokumente**. Die Detailseite zeigt PDFs per `?ansicht=inline` der Download-Route in einem Rahmen.

**Kontoauszüge stehen nicht in der Ablage:** Die Originaldateien der Importe (`ImportBatch.speicherpfad`) gehören zum Import (Vollständigkeits-Check, Aufräumen, Download) und liegen nur unter Kontoauszug → Importe.

**Ladeverhalten:** Die Übersicht rechnet nur mit dem schlanken `ladeDokumentIndex()` (eine Abfrage ohne Includes: Anzahl/Größe je Bereich, Ordnernamen). Die schweren Zeilen holt `ladeDokumente({ bereich, ordnerKey })` erst beim Öffnen eines Bereichs bzw. Ordners (Ordnerschlüssel = ID des Bezugs, schon in der Abfrage gefiltert); nur „Alle Dokumente“ lädt alles. Die Auswahllisten für „Bezug hinzufügen“ lädt `ladeBezugAuswahl` erst beim Öffnen. Gemessen: mit Includes 230–600 ms, ohne 30 ms.

**Stolperfallen**
- Client-Komponenten dürfen nichts aus `dokumente-uebersicht.ts` importieren (zieht Prisma ins Browser-Bundle) — Konstanten und Formatierung aus `dokumente-anzeige.ts`; ebenso keine Hilfsfunktionen aus einer `"use client"`-Datei in einer Server-Seite aufrufen.
- Schreibende Aktionen an Dokumenten revalidieren immer auch `/dokumente`.
- Die Einheiten-Seite (Fotos) und die Dienstleister-Seite (Verträge) listen nur Dokumente **ohne** `buchungId` — sonst erschienen Kostenbelege dort als Fotos/Verträge.
- **Tabelle** (`dokument-tabelle.tsx`): Datei, Zugeordnet zu und Aussteller haben Mindestbreiten. Mit `[overflow-wrap:anywhere]` schrumpft eine Spalte sonst auf ein Wort je Zeile — neue Textspalten brauchen eine Mindestbreite.

## Hochladen

- **An den Detailseiten** (`BelegeSektion`/`FotosSektion`, Bezug vorgegeben) und **zentral** auf `/dokumente` (`uploadDokumentZentral`: bis zu 4 Dateien, je 1 MB, zusammen 4 MB wegen Vercels Request-Limit). Ohne Auswahl „Ablegen bei“ (verworfen: vermischte Status, Bezug und Typ).
- **Kostenbelege** nur an der Kostenposition oder per Zuordnung aus dem Eingang (ein Beleg braucht eine konkrete Buchung).
- **Upload an der Kostenposition:** Der Beleg übernimmt Einheit, Gebäude und Haus der Buchung (`ladeBelegBezuege`, `src/lib/beleg-bezuege.ts`) und bekommt den Typ „Rechnung“ vorbelegt. Den **Dienstleister** bestimmen wie im Kosten-Import die Suchbegriffe aus dem Empfänger (kein Treffer = kein Bezug). Bearbeiten der Kostenposition zieht geänderte Einheit/Gebäude/Haus an den Belegen mit (`ziehBelegBezuegeNach`, nur wo der Beleg noch den alten Wert trägt). Eine schon gesetzte Art blockiert die spätere Erkennung (sie füllt nur leere Felder) — „Neu erkennen“ nutzen.
- **Zu große Dateien** (Limits in `upload-limits.ts`, `GroessenFehler`): Die Formulare lehnen sie mit Mac-Tipp ab (Vorschau → Exportieren → Quarz-Filter „Dateigröße reduzieren“). Die App verkleinert **nicht** selbst — ein im Browser verkleinertes PDF besteht nur noch aus Bildern (Text nicht mehr durchsuchbar; ausprobiert und entfernt).

**Eingang:** Neue Dokumente liegen im Bereich Eingang (`Dokument.eingang`, ohne Bezug), bis sie einen Bezug bekommen (`ordneDokumentZu` setzt `eingang` auf false) oder ausdrücklich **ohne Bezug abgelegt** werden (`legeDokumentAb`, optional mit Ordnername). Ist ein Ordner geöffnet, lässt sich direkt dort ablegen (Radiobutton, `ablegen=direkt`).

**Direkte Zuordnung beim Upload** (`DIREKT_ZUORDNEN` in `dokument-upload.tsx`, Aktion `ladeDirektAuswahl`): Wählt man vorab Vertrag, Schreiben, Protokoll (→ Mietvertrag), Foto (→ Einheit), Versicherung, Prüfbericht (→ Gebäude) oder Steuer/Behörde (→ Ordner „Steuer & Bescheide“ unter Unkategorisiert), erscheinen drei Angaben — Bezug bzw. Ordner, Datum, Titel (gilt für alle Dateien des Uploads).
- Vertrag, Schreiben, Protokoll, Foto zeigen sie immer; Versicherung, Prüfbericht, Behörde **nur ohne** Häkchen „Inhalt automatisch erkennen“ (sonst übernimmt die Erkennung die Zuordnung im Eingang).
- Rechnung, Bescheid, Abrechnung haben bewusst keine direkte Zuordnung: Die Kostenposition entsteht oft erst mit dem Kontoauszug, und „Passende Dokumente im Eingang“ findet nur Dokumente im Eingang.
- Ohne gewählten Bezug (z.B. Dienstleisterverträge) landet das Dokument im Eingang. Verworfen: komplette Zuordnung mit mehreren Bezügen im Upload-Formular.

**Prüfablauf im Eingang:** Landet ein Upload von `/dokumente` im Eingang, springt die Seite auf die Detailseite des ersten neuen Dokuments (bei Fehlermeldung nicht, direkt abgelegte auch nicht); nach `teileDokumentAuf` zum ersten Teil. **Nach dem Ablegen springt nichts automatisch weiter** (man will das Dokument meist noch ansehen; verworfen: automatisches Weiterleiten). Stattdessen zeigt die Detailseite „Prüfung im Eingang: N weitere Dokumente · Überspringen →“ bzw. „Noch im Eingang: N … · Nächstes prüfen →“ (älteste zuerst, `eingangFortschritt`, `src/lib/dokument-eingang.ts`).

## Bezüge

Detailseite `/dokumente/[id]`, `BezuegePanel`: je Art einer, mehrere Arten gleichzeitig. Begriffe wie in der Navigation: „Gebäude“ = Hausnummer (`Gebaeude`), „Haus“ = ganzes Bauwerk (`Haus`, `Dokument.hausId`).
- Hinzufügen über Vorschläge oder „+ Bezug hinzufügen“ (ohne Vorschläge gleich offen, Bezugsart passend zum Typ vorgewählt: Protokoll/Vertrag/Schreiben → Mietvertrag, Rechnung/Bescheid/Abrechnung → Kostenposition, Foto → Einheit, Versicherung/Prüfbericht/Behörde → Gebäude).
- Entfernen mit ×, **Ändern** mit „ändern“ am Chip (`ersetzeBezug`).
- **Die Kostenposition ist ein fester Nachweis:** kein Entfernen, Ändern oder Umhängen (hängt an der Löschsperre).

## Dokumenttyp und Labels

**Typ** (`Dokument.art`, Schlüssel aus `ART_OPTIONEN`): Kosten = `RECHNUNG/BESCHEID/ABRECHNUNG/ANGEBOT`, Mietverhältnis = `VERTRAG/SCHREIBEN/PROTOKOLL`, Objekt = `FOTO/VERSICHERUNG/PRUEFBERICHT/BEHOERDE`, `SONSTIGES`. Optionales Schlagwort quer zu den Ordnern: beim Upload vorab wählbar (sonst erkennt es die App), in der Tabelle änderbar (`aendereArt`), Filter „Alle Arten“. Gültige Werte prüft nur die Anwendung (freier Text), leer = „Ohne Art“. Die Uploads an den Detailseiten setzen keine Art (außer an der Kostenposition).

**Labels** sind feste Felder an `Dokument` (kein freies Tag-System): `titel`, `belegDatum`, `aussteller`, `rechnungsnummer`, `betrag` (positiv = Rechnung, negativ = Gutschrift), `leistungVon/Bis`, `kostenjahr`, `iban` (nur mit gültiger Prüfziffer), `kostenartId`, `adressat`, `objektHinweis`, dazu `erkennung`/`erkanntAm` (Rohergebnis der Erkennung).
- Das Formular „Angaben zum Dokument“ zeigt je Typ nur die passenden Felder mit passender Beschriftung (`FELDER_JE_ART` in `dokument-formulare.tsx`).
- `speichereDokumentLabels` ändert nur mitgeschickte Felder (leeres Feld leert, fehlendes bleibt) — nicht angezeigte Felder behalten ihren Wert.

## Erkennung

**Zwei Stufen (Entscheidung 12.10.2026).**

*Stufe 1 = Regeln* (`src/lib/dokument-regeln.ts`, reine Funktion `erkenneDokumentPerRegeln`, Text per `unpdf` aus `src/lib/dokument-pdf-text.ts`): Beim Hochladen liest die App PDFs **mit Textebene** lokal auf dem Server (kein Datenversand, keine Kosten). Gesucht werden Typ (nur **Titelzeilen** — kurz, mit Großbuchstaben, kein Satz), Rechnungsnummer (auch aus einem Tabellenkopf mit Werten in der Zeile darunter), Belegdatum, Gesamtbetrag (nie Netto-/MwSt-/Abschlagszeilen), IBAN, Aussteller (Dienstleister-Suchbegriffe, sonst Zeile mit Rechtsform im Briefkopf), Leistungszeitraum, Objekt (Beschriftung „Objekt:“/„Leistungsort:“ oder bekannte Straße außerhalb des Adressfelds) und Kostenart (wenn der Dienstleister genau eine hat).
- **Grundregel: lieber unsicher als falsch.** „Erkannt“ (`erkanntAm` gesetzt, Labels gefüllt, `erkennung.quelle = "regeln"`) nur, wenn alles eindeutig ist: bei Kostenbelegen Typ, genau **ein** Gesamtbetrag, genau **eine** Rechnungsnummer (bei Bescheiden optional), eindeutiges Belegdatum, und Netto + MwSt = Gesamtbetrag, wenn beide gefunden. Typen ohne Zahlung (Vertrag, Protokoll, Versicherung, Prüfbericht, Behörde) gelten bei eindeutigem Titel als erkannt (Konfidenz „mittel“).
- **Unsicher** (mehrere Beträge, mehrere Rechnungsnummern = vermutlich Sammel-PDF, mehrdeutiger Titel, Netto/MwSt-Abweichung) oder **nicht lesbar** (unter 60 Zeichen Text, Bilder): `erkanntAm` bleibt leer, im Rohergebnis nur `{ quelle: "regeln", offen: true, grund }`, **keine** Labels — halbe Werte würden die KI blockieren, weil sie nur leere Felder füllt. Die Detailseite zeigt den Grund.
- Die Regeln sind an synthetischen Test-PDFs entwickelt; jede neue Mehrdeutigkeit, die zu falschen „sicheren“ Werten führt, lieber als Ausschluss ergänzen als eine Heuristik aufweichen.

*Stufe 2 = KI-Prüfung* (`src/lib/dokument-erkennung.ts`): Claude (Haiku 4.5) liest PDF/Bild direkt (≈ 5 s je Datei, mehrere parallel), erkennt auch den Typ und meldet die Labels per Tool-Aufruf; die Antwort wird gegen Wertebereiche und die Kostenart-Liste geprüft, eine IBAN mit falscher Prüfziffer verworfen. Die KI bekommt die Dienstleister samt Kostenarten als Kontext (`ErkennungKontext.dienstleister`) und wählt die Kostenart aus denen des Ausstellers.
- **Nur auf Knopfdruck:** je Dokument „KI-Prüfung starten“ bzw. „Regeln anwenden (lokal)“ (`ErkennenBereich`, `erkenneDokument`/`erkenneDokumentRegeln`); im Eingang „Nicht erkannte per KI prüfen (N)“ (`pruefeEingangPerKi`, höchstens 6 je Klick wegen des 60-s-Limits; Abfrage `EINGANG_OFFEN_WHERE` in `src/lib/dokument-eingang-offen.ts`: Eingang, nicht ausgeblendet, nicht erkannt, erkennbarer Dateityp, ohne Vertrag/Schreiben/Protokoll/Foto).
- Optional beim Upload auf `/dokumente` das zweite Häkchen „Direkt per KI prüfen (PDF und Bilder)“ (`ki=1`, Standard aus): ersetzt die Regeln, jedes PDF/Bild geht gleich an Claude; Fehler einer Datei stoppen die anderen nicht.
- Die Detailseite nennt, womit zuletzt erkannt wurde („per Regeln (lokal)“/„per KI-Prüfung“).

**Datenschutz:** Beim Upload läuft mit dem Häkchen „Inhalt automatisch erkennen (PDF, lokal)“ (Standard an) nur die Regel-Stufe — der Inhalt verlässt den Server nicht. An Anthropic geht ein Dokument nur bei der KI-Prüfung auf Knopfdruck oder mit dem KI-Häkchen beim Upload (Hinweis am Formular und auf der Detailseite). Typen aus `AUTOMATISCH_NICHT_LESEN` (Vertrag, Schreiben, Protokoll, Foto) liest die App beim Upload gar nicht, auch nicht per Regeln; die KI-Prüfung gibt es für sie nur am einzelnen Dokument.

**Füllregel:** Die Erkennung füllt nur **leere** Labels; Eigeneingaben werden nie überschrieben, außer bei „Neu erkennen (Angaben ersetzen)“. Schlägt die Erkennung beim Upload fehl, bleibt das Dokument gespeichert und der Upload meldet es.

### Sammel-PDFs aufteilen

- Die KI meldet je PDF eine Liste von Teilen (`teile`, je Teil Seitenbereich ab 1 und eigene Angaben; mehrseitige Rechnung samt Anlagen = ein Teil, Deckblatt gehört zum folgenden Dokument, im Zweifel nicht aufteilen) und bekommt die Seitenzahl mit (`pdf-lib`). `teile` steht nur bei stimmigen Seitenbereichen im Rohergebnis (`gueltigeSeitenbereiche`); das Original bekommt dann nur Typ und den Titel „Sammel-PDF mit N Dokumenten“.
- **Aufgeteilt wird nie automatisch:** `AufteilenPanel` zeigt die Teile (Seitenbereiche änderbar, Teile entfernbar) und „In N Dokumente aufteilen“ (`teileDokumentAuf`). Jedes Teil wird ein eigenes PDF und Dokument **im Eingang** mit seinen Angaben (`herkunftId` → Original, Dateiname „… (Teil 2 von 3, S. 2–3).pdf“). Das **Original bleibt erhalten** (ausgeblendet, „Aufgeteilt in N Dokumente“, mit Links zu den Teilen). Nur ohne Bezüge am Original, nur PDFs, 2–20 Teile; bei einem Fehler werden die Dateien wieder entfernt.
- **„Nicht aufteilen (als ganzes Dokument)“** (`verwerfeAufteilung`) setzt `teileVerworfen`; die Teile bleiben für den Abgleich (Salden, Abschläge); „KI: neu erkennen“ setzt die Entscheidung zurück. Dabei füllt die Aktion die noch **leeren** Felder aus den Teilen: Titel der Teile mit „ + “ (statt des automatischen Sammel-Titels); Datum, Rechnungsnummer, Zeitraum, Kostenjahr, Adressat, Objekt, IBAN nur bei gleichem Wert in allen Teilen; **Betrag** als Summe nur bei verschiedenen Rechnungsnummern oder wenn jeder Teilbetrag sein eigener Saldo ist (Teile mit gleicher Rechnungsnummer teilen sich oft ein Deckblatt, die Summe zählte doppelt — dann leer lassen); Aussteller/Kostenart bei gleichen Teilen, sonst bei einer Abrechnung mit gleicher Rechnungsnummer aus dem **ersten** Teil (Deckblatt).
- `labelsMitErkennung` (`dokument-zuordnung.ts`) ergänzt für Vorschläge fehlende Angaben aus den Teilen (Rechnungsnummer nur bei gleichem Wert, Betrag bewusst nicht) — ohne das gab es bei Sammel-PDFs keinen Vorschlag. Vorschläge erscheinen auch bei sichtbarem Aufteilen-Block.

### Versorger-Abrechnungen (Stadtwerke)

Die Jahresabrechnung (z.B. Wasser-Rechnung + Abwasser-Bescheid in einem PDF) nennt die Gesamtkosten; abgebucht werden nur Nachzahlung/Guthaben plus der erste neue Abschlag (siehe `docs/kosten-dienstleister.md` → „Versorger-Salden“).
- Die Erkennung liest deshalb zusätzlich `kundennummer`, `salden` (Nachzahlung +, Guthaben −, je Rechnung/Bescheid, bei mehreren auch die Summe) und `abschlag` (neuer monatlicher Gesamtbetrag) — nur im Rohergebnis `Dokument.erkennung`, keine Spalte.
- `bewerteBuchung` wertet sie aus: Kundennummer im Verwendungszweck (+25, ganze Zahl ab 5 Zeichen); Saldo (auch Summe der Teile, allein oder + Abschlag) = Betrag der Kostenposition (+50, „hart“ nur zusammen mit Kundennummer oder Aussteller, sonst passte jede gleich hohe Buchung); „sicher“ bei Saldo + Kundennummer + passendem Datum.
- Ein PDF mit Rechnung und Bescheid über „In N Dokumente aufteilen“ trennen, jedes Teil an seine SR-Position hängen; eine Jahresrechnung, die zu mehreren Abschlagspositionen gehört, über „Weitere Kostenpositionen“ (siehe unten).
- Bei Stadtwerke-Scans bricht die Regel-Erkennung meist ab; Teile, Kundennummer und Salden kommen erst mit der KI-Prüfung. Das KI-Ergebnis schwankt zwischen Läufen (mal 1, mal 2 Teile, einmal ein falscher Saldo) — wegen der Bedingung „Saldo nur mit Kundennummer oder Aussteller“ meist folgenlos. Ältere Dokumente brauchen einmal „Neu erkennen“.
- Der **Adressat** ist die Kundenbezeichnung aus „für Kunde: …“, nicht das Adressfeld (Verwaltung c/o …) — ob er das Adressfeld sein soll, ist offen.

### Kostenart bei mehreren gleichartigen Kostenarten eines Dienstleisters

`sichereKostenart` (`src/lib/dokument-kostenart.ts`), nach jeder Erkennung (KI und Regeln, auch je Teil): Hat ein Dienstleister mehrere Kostenarten derselben Sparte (Stichwort im Namen: strom/gas/wasser/wärme, z.B. „Strom Garagen“ und „Allgemeinstrom“), kann das Dokument allein nicht sagen, welche gemeint ist — die KI hat dann geraten.
- Ist die Sparte unter den Kostenarten des Ausstellers eindeutig, bleibt die gewählte.
- Sonst gilt die Kostenart, die bisher an derselben **Verbrauchsstelle** (Straße + Hausnummer aus der Objektangabe, verglichen mit Verwendungszweck/Gebäude der gebuchten Kostenpositionen dieses Dienstleisters) gebucht wurde, wenn es genau **eine** ist; sonst bleibt sie **leer** mit Hinweis „Kostenart nicht eindeutig (…) – bitte wählen“.
- Bewusst nur gebuchte Kostenpositionen als Historie, nicht frühere Dokument-Labels (könnten ungeprüfte KI-Vorschläge sein). Der Prompt sagt dasselbe („rate nicht“).

## Zuordnung zu Kostenpositionen und Bezügen

**Punkte** (`src/lib/dokument-zuordnung.ts`, `bewerteBuchung`): Betrag (50), Rechnungsnummer im Verwendungszweck (40), IBAN der Bankzeile (30), Aussteller ≈ Empfänger (20), Zahlung −10…+150 Tage nach dem Beleg (10), Kostenjahr (5). Ein Vorschlag braucht mindestens einen **harten** Treffer (Betrag, Rechnungsnummer oder IBAN); **„sicher“** = Betrag stimmt und (Rechnungsnummer oder (IBAN/Name und Datum)).
- Stolperfalle: `normalizeText` zieht alles zu einem Wort zusammen — Namen (z.B. „Firma - Inh. Vorname Nachname“) vorher an Nicht-Buchstaben trennen (`namenstoken`), sonst passt der Aussteller nur bei fast gleichem Bankempfänger.
- **Angebot** (`ANGEBOT`): Es hat keine eigene Zahlung, die Rechnung zum Auftrag trägt eine andere Nummer und oft einen anderen Betrag. Deshalb zählen das **Objekt** (Hausnummer und Wohnung gegen die Einheit der Kostenposition +45, nur Haus +10, Gebäude-Kosten +25), der Aussteller (+20) und der Zeitraum bis 400 Tage nach dem Angebotsdatum; ein Vorschlag braucht Objekt **und** Aussteller. Felder heißen dort „Angebotsnummer“/„Angebotssumme“.
- **Schon belegt:** Hängt an der vorgeschlagenen Position schon ein Beleg, steht ein gelbes Badge „⚠ hat schon N Beleg“ (`Vorschlag.belege`, zählt gemeinsame Belege mit) und der Bestätigungsdialog nennt es. Mehrere Belege je Position sind erlaubt, das Anhängen ist aber fest.
- **Nie stille Automatik:** jede Zuordnung braucht einen Klick. Die Sammelbestätigung „Sichere Vorschläge übernehmen“ (Eingang) ordnet nur zu, wenn es genau **einen** sicheren Treffer gibt und die Position noch keinen Beleg hat. Die Kostenposition zeigt umgekehrt „Passende Dokumente im Eingang“ (`ladeEingangFuerBuchung`).

**Haus und Gebäude:** `hausnummernAusText` liest die Nummern hinter „Straße“ („2/6“, „2-6“, „2/4/6“, „2, 4, 6“; höchstens dreistellig, damit die PLZ nicht zählt). Nennt die Objektangabe mehrere Nummern, schlägt `ladeHausVorschlaege` das **Haus** vor, dessen Hausnummern alle genannten enthalten und dessen kleinste/größte Nummer den Grenzen entspricht; die Einzelvorschläge entfallen. Eine einzelne Nummer bleibt ein Gebäude (Hausnummer als ganzes Wort).

**Weitere Vorschläge** (nur, was dem Dokument noch fehlt): Mietvertrag über den Nachnamen im Adressaten **oder in der Objektangabe** (auch beendete Verträge, gekennzeichnet; + Straße/Wohnung), **Einheit** über Adresse plus „Wohnung Nr. 4“/„WHG 4“ (`ladeEinheitVorschlaege`), Dienstleister über dessen Suchbegriffe.

## Kostenbelege

**Löschsperre:** Dokumente mit `buchungId` (Nachweis für Finanzamt und Nebenkostenabrechnung; keine GoBD-Pflicht, aber Beweislast) werden **nicht gelöscht, sondern ausgeblendet** (`Dokument.ausgeblendetAm/ausgeblendetVon`, `blendeDokumentAus`/`stelleDokumentWiederHer`; `deleteDokument` lehnt sie ab). Ausgeblendete fehlen in allen Listen der Ablage und erscheinen nur auf der Kostenposition unter „Ausgeblendete Belege“ mit „Wiederherstellen“. Andere Dokumente bleiben löschbar; ob Mieterakten ebenfalls gesperrt werden, ist offen.
- Beim Ersetzen einer Kostenposition per Storno wandern die Belege mit (Checkliste in `CLAUDE.md` → „Storno statt Ändern“). Eine bloß stornierte Position behält ihre Belege.

**Ein Beleg für mehrere Kostenpositionen** (`DokumentBuchung`, Tabelle `dokument_buchungen`): Bei laufenden Abschlägen (Allgemeinstrom, Wasser, Versicherungsraten) gehört **eine** Jahresrechnung oder ein Abschlagsplan zu allen Positionen des Jahres.
- `Dokument.buchungId` bleibt die **Hauptposition** (Löschsperre, Ablage, Ordner „Kosten“ — dort steht das Dokument nur bei ihr); weitere Positionen stehen in `dokument_buchungen` (eindeutig je Paar).
- Zuordnen auf der Dokument-Detailseite im Kasten „Weitere Kostenpositionen“ (`ladeWeitereKostenKandidaten`): Kandidaten sind aktive Kostenpositionen derselben Kostenart, desselben Kostenjahrs und **derselben Zuordnung** wie die Hauptposition (Gebäude, sonst Einheit, Haus oder Kostengruppe). Zwei Häkchen heben die Einschränkung auf: „Auch andere Objekte“ (zeigt dann das Gebäude je Zeile) und „Auch andere Kostenarten des Jahres“. Mehrere Positionen auf einmal.
- **Vorauswahl:** Nur bei Dokumenttyp „Abrechnung“ und erkannter Kundennummer in der Hauptposition sind Kandidaten mit gleicher Kundennummer, gleicher Kostenart und gleichem Objekt, die noch keinen eigenen Beleg haben, vorangehakt (Jahresabrechnung → alle Abschläge des Jahres mit einem Klick). Bei einer Rechnung oder ohne Kundennummer gibt es keine Vorauswahl — ein Handwerker trägt auf allen Rechnungen dieselbe Kundennummer, jede Reparatur des Hauses wäre sonst ein Treffer. Die Auswahl wird bei jedem Umschalten eines Häkchens neu gesetzt.
- Die Belegprüfung zählt eine solche Position als BELEGT, solange das Dokument nicht ausgeblendet ist; auf `/kosten/[id]` erscheint der Beleg als „Gemeinsamer Beleg“ mit „Zuordnung lösen“. Das Ausblenden des Hauptbelegs warnt, wenn weitere Positionen daran hängen.

## Belegprüfung und Belegpflicht

**Belegprüfung der Nebenkostenabrechnung** (`src/lib/beleg-status.ts`, `beleg-pruefung.ts`): Der Mieter darf die Belege einsehen, deshalb soll jede umlagefähige Kostenposition ein Dokument haben (`Dokument.buchungId` oder `dokument_buchungen`, nicht ausgeblendet).
- **Status je Position** (`ladeBelegStatus`, drei schmale Abfragen): BELEGT / AUSNAHME („Kein Beleg nötig“) / FEHLT / ENTFAELLT. **Aufgeteilte Positionen** (`aufteilungGruppeId`): ein Beleg an irgendeinem Teil deckt die ganze Gruppe.
- **„Kein Beleg nötig“** (Pauschale, Gutschrift ohne Dokument) braucht eine Begründung und liegt in `buchung_beleg_ausnahmen`; beim Ersetzen per Storno wandert sie mit (`uebernehmeBelegAusnahme`).
- **Wo:** Seite `/nebenkostenabrechnungen/[id]/belege` (Zähler, Liste ohne Beleg, Auswertung nach Kostenart; nur lesend, rechnet beim Aufruf); Spalte „Beleg“ + Filter „Umlage / Beleg“ in der Kosten-Liste (`KostenpositionRow.belegStatus`; zweites Filterfeld der `DataTable`, `selectFilter2` mit Prädikat `matches`, weil eine Zeile zu mehreren Optionen passen kann); Box „Beleg“ auf `/kosten/[id]` (`BelegAusnahme`); Hinweiszeile auf der Abrechnungsseite und eine **Bestätigungsfrage** vor „Als versendet markieren“, wenn Belege fehlen — bewusst **kein Sperren**.
- Client-Komponenten importieren nur aus `beleg-anzeige.ts` (ohne Prisma), nicht aus `beleg-status.ts`.
- Nicht gebaut: eine „Belegeinsicht“ für den Mieter (Belegliste je Kostenart als PDF/Ansicht).

**Belegpflicht für alle Kostenarten** (`Kostenart.belegErforderlich`, Entscheidung 05.11.2026): Auch nicht umlagefähige Ausgaben brauchen einen Beleg, falls das Finanzamt prüft (bei Reparaturen und Verwaltungskosten fehlte fast alles).
- `belegPflichtig` gilt für jede Kostenposition mit Kostenart, außer die Kostenart hat `belegErforderlich = false` (Häkchen „Einzelbeleg erforderlich“) oder es ist die Gegen-Gutschrift „Verrechnet mit Kaution“ (`bezugTyp = "Buchung"`). Neue Kostenarten sind standardmäßig pflichtig.
- **Ausnahmen** (Kontoauszug bzw. interne Forderung ist der Beleg): Nebenkosten des Geldverkehrs, Mahngebühren, Verzugszinsen, Mietminderung, Sonstige Einnahmen (Waschgeld). Darlehenszinsen bleiben pflichtig (Jahresbescheinigung als gemeinsamer Beleg).
- **Techem-Kostenarten** (Schlüssel `IN_ABRECHNUNG_ENTHALTEN`: Gas, Wasser/Abwasser, Heizungswartung, Rauchmelder, Schornsteinfeger) sind **ausdrücklich pflichtig** — die Techem-Abrechnung wird als gemeinsamer Beleg angehängt (der Mieter kann die Rechnungen sehen wollen).
- **Wo:** Kosten-Liste (Filter „Beleg fehlt“ für alle bzw. nur umlagefähige), Box auf `/kosten/[id]`, Hinweis `BelegLueckenHinweis` mit Zähler und den Kostenarten mit den meisten Lücken auf Jahresübersicht und Aufstellung für die Steuererklärung (`zaehleBelegLueckenJahr`, Abflussprinzip; in der Druckansicht ausgeblendet) — **kein Sperren**.
- Die Belegprüfung der NK-Abrechnung (`ladeBelegPruefung`, `zaehleBelegLuecken`) und der Arbeitskosten-Ausweis bleiben auf umlagefähige Kostenarten beschränkt (inklusive Techem).
- Der Bestand ist weitgehend unbelegt und nachzupflegen (Eingang der Ablage, Vorschläge je Kostenposition).

## Versandte Schreiben ablegen

`src/components/schreiben-ablegen.tsx`, eingebunden im Anpassungsschreiben (`anpassungsschreiben.tsx`, NK-Anpassung und Indexmiete). Diese Schreiben werden per `window.print()` gedruckt und nirgends gespeichert — nach dem Versand legt man die PDF-Kopie über die Box „Kopie in der Mieterakte ablegen“ als `Dokument` am Mietvertrag ab (Art `SCHREIBEN`, Belegdatum = Datum des Schreibens, 1 MB, nur PDF). Die Box listet die schon abgelegten Schreiben des Vertrags.
- Bewusst **kein** automatisches Speichern (die Kopie ist der Nachweis des tatsächlich Versandten, z.B. für den Zugang einer Erhöhungserklärung) und **kein** Zwang — „Übernehmen“ geht auch ohne Kopie.
- Auch die PDF-Schreiben der Betriebskostenabrechnung werden von Hand abgelegt.
