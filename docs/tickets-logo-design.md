# Tickets, Logo, Design hell/dunkel

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Tickets

`/tickets`, Tabellen `tickets`, `ticket_kommentare`, `ticket_kosten`: internes Merkzettel-System, kein Mieter- oder Gast-Zugang.

- **Kategorien:** Mangel/Reparatur, Mieteranfrage, Aufgabe, Buchhaltung, Sonstiges; neue Tickets sind mit „Buchhaltung“ vorbelegt. Die Liste `/tickets` hat zwei Tabellen: oben alle Kategorien außer Buchhaltung, unten nur Buchhaltung.
- **Bezug** (Einheit, Mietvertrag, `Haus`, `Gebaeude`, Dienstleister) ist optional und wird beim Löschen des Bezugsobjekts nur gelöst (SetNull). Im Formular stehen alle Mietverträge zur Auswahl, auch beendete und geplante (Zusatz „– beendet“/„– geplant“, laufende je Einheit zuerst — Tickets betreffen oft ausgezogene Mieter). Ein Mietvertrag legt die Einheit fest, ein Einheitenwechsel leert einen nicht passenden Vertrag. Liste: Reihenfolge Einheit → Hausnummer → Gebäude.
- **Kosten** hängen über `ticket_kosten` am Ticket (nicht über `Buchung.bezugTyp/bezugId`: Buchungen sind unveränderlich, und ein Ticket kann mehrere Kosten haben). Wird eine verknüpfte Kostenposition bearbeitet oder storniert, fällt sie aus dem Ticket und muss neu verknüpft werden.
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

- **Im Einsatz:** Tickets (`TicketKarte` in `src/app/(app)/tickets/ticket-table.tsx`): Titel groß, darunter Status/Priorität/Fälligkeit, dann Bezug und klein Kategorie/Zuständigkeit.
- Suche, Filter und die Reihenfolge gelten wie in der Tabelle; Spaltenköpfe zum Umsortieren gibt es in der Kartenansicht nicht.
- **Grenzen:** Auswahl-Checkboxen, aufklappbare Zeilen und Fußzeilen (Summen) gibt es in den Karten nicht. Beide Ansichten stehen im HTML (Umschaltung per CSS) — für kurze Listen gedacht, nicht für Tabellen mit Hunderten Zeilen.
- Suchfeld und Filter der `DataTable` sind unter `sm` so breit wie die Seite.

## Formularzeilen: Felder und Knöpfe gleich groß

Dem Eigentümer wichtig, gilt für **jede neue und jede angefasste Seite**: Stehen Auswahlfelder, Eingabefelder und Knöpfe nebeneinander (Filter-/Anzeigezeilen, Formulare mit „Anzeigen“/„Speichern“), haben sie **dieselbe Höhe** (`h-10`) und, bei gleichartigen Feldern bzw. dem Knopf daneben, dieselbe Breite (z.B. `w-32`). Nicht über `py-*` steuern: Felder haben einen Rahmen (+2 px), Hauptknöpfe (`bg-white`) keinen — mit gleichem `py-2` ist der Knopf 2 px niedriger als das Feld. Muster: `src/app/(app)/jahresuebersicht/jahr-filter-form.tsx`.

- `DateInput` ist in der Standardgröße (`md`) ebenfalls `h-10`; `size="sm"` bleibt die Kompaktvariante für Tabellenzellen.
- Ausnahme: bewusst kleine Elemente in Tabellenzellen und Kompaktzeilen (`text-xs`) behalten ihre Höhe, müssen aber untereinander gleich hoch sein.
