# Tickets, Logo, Design hell/dunkel

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Tickets

`/tickets`, Tabellen `tickets`, `ticket_kommentare`, `ticket_kosten`: internes Merkzettel-System, kein Mieter- oder Gast-Zugang.

- **Kategorien:** Mangel/Reparatur, Mieteranfrage, Aufgabe, Buchhaltung, Sonstiges; neue Tickets sind mit „Buchhaltung“ vorbelegt. Die Liste `/tickets` hat zwei Tabellen: oben alle Kategorien außer Buchhaltung, unten nur Buchhaltung.
- **Bezug** (Einheit, Mietvertrag, `Haus`, `Gebaeude`, Dienstleister) ist optional und wird beim Löschen des Bezugsobjekts nur gelöst (SetNull). Im Formular stehen alle Mietverträge zur Auswahl, auch beendete und geplante (Zusatz „– beendet“/„– geplant“, laufende je Einheit zuerst — Tickets betreffen oft ausgezogene Mieter). Ein Mietvertrag legt die Einheit fest, ein Einheitenwechsel leert einen nicht passenden Vertrag. Liste: Reihenfolge Einheit → Hausnummer → Gebäude.
- **Kosten** hängen über `ticket_kosten` am Ticket (nicht über `Buchung.bezugTyp/bezugId`: Buchungen sind unveränderlich, und ein Ticket kann mehrere Kosten haben). Wird eine verknüpfte Kostenposition bearbeitet oder storniert, fällt sie aus dem Ticket und muss neu verknüpft werden.
- **Privat:** Das Häkchen „Privat“ (`tickets.privat`) macht ein Ticket nur für den Ersteller sichtbar — Liste, Detailseite (sonst 404), Zähler im Dashboard, Ticket-Listen auf Einheit/Mietvertrag/Dienstleister, Anhänge in der Ablage und der Download. Filter: `sichtbareTickets` / `sichtbareTicketDokumente` (`src/lib/ticket.ts`) — **jede neue Abfrage auf Tickets bzw. Ticket-Anhänge muss sie verwenden**, ebenso jede Aktion auf ein Ticket (`pruefeTicketSichtbar`). Ein privates Ticket hat keine Zuständigkeit (der Zuständige sähe es nicht). Nur der Ersteller stellt „Privat“ um; bei Altbestand ohne Ersteller darf es jeder und wird dabei Ersteller. Kostenpositionen und Buchungen bleiben für alle sichtbar, nur die Verknüpfung am privaten Ticket nicht.
- **Verlauf:** Änderungen an Status, Priorität, Kategorie und Zuständigkeit schreiben automatisch einen `system`-Eintrag. `erledigtAm` wird beim Wechsel auf Erledigt gesetzt und bleibt bei erneutem Speichern erhalten. "Überfällig" = nicht erledigt und `faelligAm` vor heute (`istUeberfaellig`, `src/lib/ticket.ts`).

## Logo

Haus mit sechs Fenstern im Kreis, nach Handskizze des Eigentümers: alle Striche gleich stark (52 im viewBox-Maß), Dach symmetrisch mit kleinem Überstand, Ecken außen leicht gerundet (Radius 12, innen scharf) — deshalb sind Dach und Wände gefüllte Pfade statt Linien. Entscheidung: **schwarz-weiß** (nicht gelb).

- Komponente `src/components/logo.tsx` (`currentColor`; in `NavBar` und Login mit `text-white`, das im hellen Design schwarz wird).
- **Icons** liegen in `public/icons/` mit Version im Namen (`logo-v2.svg`, `logo-v2-512.png`, `logo-v2.ico`, `logo-v2-apple.png`; für die installierte App `logo-v2-app-192.png`, `logo-v2-app-512.png`, `logo-v2-maskable-512.png`, siehe „App auf dem Home-Bildschirm“) und werden über `metadata.icons` in `src/app/layout.tsx` eingebunden — nicht als Datei-Konvention in `src/app/`. Grund: Safari hält Icons je URL sehr lange im Speicher; bei einer Änderung neue Dateinamen (`v3`) und die Einträge im Layout anpassen.
- Zusätzlich `public/favicon.ico`, `public/apple-touch-icon.png`, `public/apple-touch-icon-precomposed.png` für Browser, die die Standardpfade abfragen (ohne Datei lieferte die Auth-Middleware dort die Login-Seite als HTML).
- `logo-v2.svg` passt sich per `prefers-color-scheme` an; `logo-v2-512.png` und `.ico` (16/32/48) sind schwarz auf transparent; `logo-v2-apple.png` (180) schwarz auf weiß (iOS füllt Transparenz schwarz). Bei Formänderungen alle Dateien und die Komponente anpassen.
- E-Mail-Köpfe: `public/email/logo-schwarz.png` (480 × 480, schwarz auf weiß, ohne Text, für ca. 120 px Breite), weil Mail-Programme SVG oft nicht anzeigen.
- **PNG erzeugen:** Am einfachsten mit `sharp` (kommt mit Next, `node -e` im Projektordner): SVG einlesen, den `<style>`-Block entfernen, auf weißen Grund setzen, Alphakanal entfernen. `rsvg-convert` und ImageMagick gibt es auf der Entwicklermaschine nicht, headless Chrome (`--screenshot`) hängt. Alternative ohne `sharp`: das SVG im Browser-Pane auf ein Canvas zeichnen (vorher den `<style>`-Block der SVG entfernen, sonst nimmt das Canvas die Farbe des Browser-Modus) und das PNG per `fetch` an einen kurzlebigen lokalen Empfänger schicken; die `.ico` per kleinem Python-Skript zusammensetzen.

## App auf dem Home-Bildschirm (PWA)

Die Seite lässt sich als App installieren (iPhone: Safari → Teilen → „Zum Home-Bildschirm“) und öffnet dann im Vollbild ohne Browserleiste. Kein App Store, kein Capacitor.

- **Manifest:** `src/app/manifest.ts` → `/manifest.webmanifest` (Name, `display: standalone`, Start `/`, Icons). Das Manifest und `icons/` sind in `src/proxy.ts` von der Anmeldung ausgenommen — Browser rufen beides ohne Cookies ab und bekämen sonst die Login-Seite als HTML.
- **Icons der App:** `logo-v2-app-192.png` und `-512.png` (Logo auf 88 % der Kantenlänge) sowie `logo-v2-maskable-512.png` (72 %, damit der Kreis in der runden Maske von Android nicht beschnitten wird). Alle schwarz auf weiß **ohne Transparenz**, weil das transparente Logo auf dunklem Startbildschirm unsichtbar wäre. Das iPhone nimmt weiter `logo-v2-apple.png`.
- **Statusleiste:** `generateViewport` in `src/app/layout.tsx` setzt `theme-color` passend zum Design (Cookie `theme`; bei „System“ zwei Einträge mit `prefers-color-scheme`). `appleWebApp.statusBarStyle` ist `default`: Die Seite beginnt unter der Statusleiste. Verworfen: `black-translucent`, weil die Navigation dann unter der Uhr läge und die Schrift der Leiste immer weiß wäre (im hellen Design unlesbar).
- **Kein `viewport-fit=cover`, keine Safe-Area-Abstände:** Es gibt keine am Bildschirmrand fixierten Leisten (die Navigation scrollt mit). Mit `cover` läge der Inhalt im Querformat unter der Kerbe. Erst wenn eine unten fixierte Leiste dazukommt, braucht sie `cover` plus `env(safe-area-inset-bottom)`.
- **Kein Service Worker, kein Offline-Betrieb:** Alle Seiten sind dynamisch und zeigen Finanzdaten. Ein Zwischenspeicher könnte veraltete Salden und Buchungen anzeigen, und schreiben geht ohne Netz ohnehin nicht. iOS braucht für „Zum Home-Bildschirm“ keinen Service Worker.
- **Anmeldung:** Die installierte App hat auf dem iPhone einen eigenen Speicher, getrennt von Safari — beim ersten Öffnen einmal anmelden.
- **Anleitung in der App:** „Mein Konto“ → „App auf dem Handy“ (`src/app/(app)/konto/page.tsx`) erklärt die Installation für iPhone und Android in zwei Zeilen.
- **Änderungen an Name oder Icon** übernimmt iOS nicht nachträglich: App vom Home-Bildschirm löschen und neu hinzufügen (bei neuen Icons zusätzlich neue Dateinamen, siehe Logo).

## Design hell/dunkel

- Standard ist **System** (folgt dem Gerät, auch bei Wechsel zur Laufzeit); fest Hell oder Dunkel wählt der Nutzer unter „Mein Konto“ → Darstellung (`ThemeSchalter`, `src/components/theme-schalter.tsx`).
- Gespeichert nur im Cookie `theme` (`light`/`dark`/`system`, ohne Cookie = `system`; pro Browser, keine DB). Das Root-Layout setzt `data-theme` am `<html>`, ein Skript im `<head>` löst „System“ vor dem ersten Zeichnen auf — `data-theme` ist daher immer `light` oder `dark`.
- Alle Seiten sind mit den dunklen Tailwind-Klassen gebaut (`neutral-*`, `text-white`, `bg-white text-black` für Hauptknöpfe). Das helle Design kehrt in `globals.css` nur die Farbvariablen um (weiß ↔ schwarz, Neutral-Skala gespiegelt, Signalfarben wie `red-400` abgedunkelt). Neue Seiten nutzen einfach die vorhandenen Klassen.
- Stolperfallen: Hauptknöpfe (`.bg-white`) hätten durch die Umkehrung tiefschwarz — dafür gibt es eine Sonderregel (hellgrau). Das Schreiben `.druckbereich` ist Papier und setzt die Farbvariablen zurück. Farben außerhalb der Skala (Hex, `amber-700` u.ä.) werden nicht umgekehrt und müssen bei Bedarf einzeln in `globals.css` ergänzt werden.

## Mobiles Menü

Unter `md` zeigt `NavBar` statt der Dropdowns das Menü hinter dem ☰-Knopf (`MobilesMenue` in `src/components/nav-bar.tsx`).

- **Tippflächen:** Jede Zeile geht über die ganze Breite und ist mindestens 48 px hoch (`min-h-12`, `text-base`), der Menüknopf 44 × 44 px. Neue Einträge übernehmen das über `mobilZeile()`.
- **Gruppen zum Aufklappen** (Stammdaten, Finanzen, Abrechnung, Verwaltung); Dashboard und Tickets stehen direkt darüber. Beim Öffnen ist die Gruppe der aktuellen Seite aufgeklappt. Verworfen: alle Punkte untereinander, weil das über 30 Zeilen und viel Scrollen ergibt.
- **Aktuelle Seite:** markiert wird der Menüpunkt mit dem längsten passenden Pfad (`aktiverHref`), also auch auf Unterseiten.

## Tabellen auf dem Handy: Kartenansicht

Breite Tabellen sind auf dem Handy schwer lesbar. `DataTable` kann deshalb unter `md` statt der Tabelle eine Kartenliste zeigen: Prop `mobileCard={(row) => …}` liefert den Inhalt einer Karte; Rahmen, Abstand und der Link um die ganze Karte (aus `rowHref`) kommen von `DataTable`.

- **Im Einsatz:** alle Listen mit `DataTable` (Tickets, Zahlungen, Kosten, Mietverträge, Mieter, Einheiten, Gebäude, Kostenarten, Miete je Monat, Offene Posten, Kontostand, Mietweiterleitungen, Kautionen, Nebenkostenausgleich, Jahresübersicht, Mieterhöhung, NK-Anpassung, Lastschrift-Mandate, Kontoauszug-Importe, Dokumente, Dienstleister, Positionen der Nebenkostenabrechnung). **Neue Tabellen bekommen von Anfang an eine Karte.**
- **Bausteine:** `src/components/karte.tsx` (`KarteKopf`, `KarteZeile`, `KarteMeta`, `KarteWerte`, `KarteNotiz`, `KarteAktionen`) — damit alle Karten gleich aufgebaut sind.
- **Aufbau einer Karte:** oben links die Hauptangabe (Titel, Einheit, Kostenart), oben rechts der wichtigste Betrag oder der Status (bei Salden mit kleiner Beschriftung darunter, z.B. „Saldo“); darunter die zweite Angabe (Mieter, Empfänger), dann eine Zeile mit Datum und Kennzeichen, dann Zahlenwerte mit Beschriftung (drei je Zeile), zuletzt klein und einzeilig abgeschnitten der Freitext.
- **Nur zeigen, was etwas aussagt:** Kennzeichen und Zahlenwerte entfallen, wenn sie leer bzw. null sind (Kosten: „umlagefähig“ nur wenn zutreffend, kein Kennzeichen = nicht umlagefähig; Offene Posten: „davon“-Werte nur ungleich null).
- **Hinweise als Text:** Was in der Tabelle nur im Tooltip steht (⚠-Warnungen), gehört in der Karte ausgeschrieben dazu — Tooltips gibt es auf dem Handy nicht.
- **Links und Knöpfe in der Karte:** Normalerweise keine — die ganze Karte ist der Link zur Detailseite. Braucht die Karte eigene (Telefonnummer, E-Mail, „Schreiben erstellen“, „Datei öffnen“), `mobileCardInteraktiv` setzen: Die Karte reagiert dann wie eine Tabellenzeile auf den Klick daneben. Texte in solchen Knöpfen abschneiden (`truncate`), Telefonfelder enthalten teils lange Zusätze.
- **Kartenziel:** `mobileCardHref`, wenn die Karte woanders hinführt als die Tabellenzeile oder die Tabelle keine klickbaren Zeilen hat (Dokumente → Detailseite).
- **Lange Listen:** Es erscheinen zunächst 50 Karten, „Weitere anzeigen“ lädt je 50 nach. Suche und Filter durchsuchen immer alle Zeilen.
- **Sortieren:** Spaltenköpfe gibt es in der Kartenansicht nicht. Prop `mobileSort` zeigt stattdessen ein Auswahlfeld „Sortierung“ mit wenigen, je Seite ausgewählten Reihenfolgen (z.B. älteste zuerst, höchster Rückstand); ohne Auswahl gilt die Reihenfolge der Tabelle.
- **Summen:** `mobileSummary` zeigt die Summen der Fußzeile als eigenen Kasten **über** der Kartenliste (am Listenende wären sie auf dem Handy zu weit weg).
- **Grenzen — nur in der Tabelle (Desktop):** Mehrfachauswahl (CSV-Export, mehrere löschen, mehrere Mandate drucken), aufklappbare Zeilen (Rohdaten, Aufschlüsselung der NK-Position) und das Bearbeiten in der Zeile (Kommentare, Prüfstern, Kategorie einer Kautionsbuchung, Art/Belegdatum/Ordner eines Dokuments) — in der Karte sind diese Angaben nur lesbar. Hinweise und Knöpfe, die sich nur auf die Mehrfachauswahl beziehen, unter `md` ausblenden. Beide Ansichten stehen im HTML (Umschaltung per CSS).
- **Seitenkopf:** Überschrift und Knöpfe („Neu“, „Importieren“) stehen unter `md` untereinander (`flex-col items-start … md:flex-row md:items-center`), die Knöpfe brechen um (`flex-wrap`) — sonst quetscht die Knopfreihe den Text zusammen oder ragt über den Rand. Dasselbe gilt für Filterzeilen (`flex-wrap`).
- **Eigene Kartenliste ohne `DataTable`:** Die Zeilen der Import-Vorschau (`kontoauszug/import/buchungen-tabelle.tsx`) sind bearbeitbar (Buchungsart, Mietvertrag, Kostenart, Darlehen …) und mit Auswahlfeldern schwer; dort wird unter `md` per `matchMedia` (`useMobil`) **nur eine** der beiden Ansichten gerendert, nicht beide. Die Zellinhalte stehen als gemeinsame JSX-Konstanten vor dem Rendern und dienen Tabellenzeile und Karte; Felder in der Karte sind `h-10`. Muster für weitere bearbeitbare Zeilenlisten.
- **Tabellen ohne `DataTable`** (Auswertungen, Abrechnungen, Detailseiten) — zwei Muster:
  - *Konto-Listen* (viele Spalten je Bewegung: Mieterkonto, Kautionskonto): unter `md` eine Kartenliste mit den Bausteinen aus `karte.tsx` (`<ul className="… md:hidden">`), die Tabelle bekommt `hidden md:block`.
  - *Aufstellungen* (Bezeichnung + Betrag, dazu Nebenspalten: Jahresübersicht, Nebenkosten- und Kautionsabrechnung am Mietvertrag): Die Tabelle bleibt, Nebenspalten bekommen `hidden md:table-cell` und ihr Inhalt steht unter `md` klein unter der ersten Spalte (`<span className="block text-xs … md:hidden">`). Mindestbreiten nur ab `md` (`md:min-w-[…]`), Beträge mit `whitespace-nowrap`.
  - **Stolperfalle `colSpan`:** Ausgeblendete Zellen (`display: none`) zählen nicht als Spalte — eine Summenzeile mit `colSpan` steht auf dem Handy sonst eine Spalte zu weit rechts. Statt `colSpan` eine eigene leere Zelle mit `hidden md:table-cell` danebensetzen.
  - Zwei Tabellen nebeneinander (`grid-cols-2`) und Kennzahl-Kästen (`grid-cols-3`) stehen unter `md` bzw. `sm` untereinander (`grid-cols-1 md:grid-cols-2`).
- **Noch nicht umgestellt** (scrollen auf dem Handy seitlich in ihrem Kasten): Benutzer, Buchungsarten, Darlehen und Tilgungsplan, „Kontostand prüfen“, Vorschläge auf der Dienstleister-Seite, Mieterhöhungen im Formular „Mietvertrag bearbeiten“, die Eingabetabellen der Nebenkostenabrechnung (Gesamtabrechnung).
- Suchfeld und Filter der `DataTable` sind unter `sm` so breit wie die Seite.

## Tabellen am Computer: nie breiter als die Seite

Der Seiteninhalt ist höchstens 1152 px breit (`max-w-6xl` im Layout), auch auf großen Bildschirmen. Eine Tabelle mit vielen Spalten ragt sonst rechts hinaus und muss seitlich gescrollt werden. Regeln, umgesetzt auf der Kosten- und der Zahlungen-Tabelle (`kosten/kosten-table.tsx`, `zahlungen/zahlungen-table.tsx`; Muster für weitere Seiten):

- **Zwei Freitext-Spalten teilen sich eine Füllspalte** (`fuellend: true` an der Spalte): oben die Hauptangabe (Empfänger), darunter klein und grau der Freitext (Beschreibung), beide einzeilig abgeschnitten (`truncate`), voller Text im `title` und — wo vorhanden — in der aufgeklappten Bankzeile. Die Füllspalte nimmt die Breite, die die anderen Spalten übrig lassen (mindestens 208 px), und macht die Tabelle nie breiter. Höchstens eine je Tabelle; die Suche durchsucht beide Texte.
- **Ja/Nein-Spalten werden Kennzeichen:** kurze Überschrift mit Tooltip („Uml.“), Kennzeichen nur wenn es zutrifft (wie auf der Karte). Die Spalte bleibt sortierbar.
- **Aktions-Spalten ohne Text:** Symbol-Knopf mit `title`/`aria-label` statt Wort (Rohdaten: `<RohdatenToggleButton symbol />`), Spaltenüberschrift leer.
- **Spalten mit Bezeichnungen bekommen eine feste Breite** über ein `<div className="w-…">` in der Zelle (nicht über die Zelle selbst) und brechen darin um; ein Zusatz (Einheit hinter der Adresse, Klammerzusatz der Kostenart) steht klein darunter. Ohne feste Breite drückt die Füllspalte sie auf ihr längstes Wort zusammen.
- **Beträge rechtsbündig** (`align: "right"`, `className: "whitespace-nowrap tabular-nums"`); der Sortierpfeil steht dann vor der Überschrift.
- **`kompakt`** an der `DataTable` verringert den Spaltenabstand (`px-3` statt `px-4`).
- **Ziel:** ab etwa 1080 px Fensterbreite kein seitliches Scrollen; Zeilen höchstens zwei Textzeilen hoch. Darunter (bis `md`) scrollt die Tabelle weiter in ihrem Kasten.
- **Prüfen:** im Browser bei 1440 px `scrollWidth − clientWidth` des Tabellen-Kastens messen (muss 0 sein), siehe `docs/lokal-testen.md`.
- **Preis der Füllspalte:** Zeilen mit Freitext sind zwei Textzeilen hoch (53 px). Wo der Freitext vorher einzeilig abgeschnitten in einer eigenen Spalte stand (Zahlungen: 39 px), passen dadurch weniger Zeilen auf den Bildschirm — dafür ist mehr vom Text lesbar und nichts ragt hinaus.
- **Noch breiter als die Seite** (gemessen bei 1440 px): Mieter-Tabelle der Jahresübersicht, Positionen der Nebenkostenabrechnung, Kautionen, Dokumente, Mieterkonto am Mietvertrag, Mögliche Mieterhöhungen, NK-Anpassung, Offene Posten. Die ersten beiden haben 12–16 Betragsspalten und brauchen einen eigenen Ansatz (feststehende erste Spalten oder Spaltengruppen).
- Verworfen: Spalten ein-/ausblendbar machen (zusätzliche Bedienung, Zustand müsste gespeichert werden); kleinere Schrift.
- Offen: breitere Seite auf großen Bildschirmen (die Begrenzung gilt für alle Seiten; Formulare und Texte sollen nicht mitwachsen).

## Formularzeilen: Felder und Knöpfe gleich groß

Dem Eigentümer wichtig, gilt für **jede neue und jede angefasste Seite**: Stehen Auswahlfelder, Eingabefelder und Knöpfe nebeneinander (Filter-/Anzeigezeilen, Formulare mit „Anzeigen“/„Speichern“), haben sie **dieselbe Höhe** (`h-10`) und, bei gleichartigen Feldern bzw. dem Knopf daneben, dieselbe Breite (z.B. `w-32`). Nicht über `py-*` steuern: Felder haben einen Rahmen (+2 px), Hauptknöpfe (`bg-white`) keinen — mit gleichem `py-2` ist der Knopf 2 px niedriger als das Feld. Muster: `src/app/(app)/jahresuebersicht/jahr-filter-form.tsx`.

- `DateInput` ist in der Standardgröße (`md`) ebenfalls `h-10`; `size="sm"` bleibt die Kompaktvariante für Tabellenzellen.
- Ausnahme: bewusst kleine Elemente in Tabellenzellen und Kompaktzeilen (`text-xs`) behalten ihre Höhe, müssen aber untereinander gleich hoch sein.
