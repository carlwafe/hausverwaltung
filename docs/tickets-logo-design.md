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
- **Icons** liegen in `public/icons/` mit Version im Namen (`logo-v2.svg`, `logo-v2-512.png`, `logo-v2.ico`, `logo-v2-apple.png`) und werden über `metadata.icons` in `src/app/layout.tsx` eingebunden — nicht als Datei-Konvention in `src/app/`. Grund: Safari hält Icons je URL sehr lange im Speicher; bei einer Änderung neue Dateinamen (`v3`) und die Einträge im Layout anpassen.
- Zusätzlich `public/favicon.ico`, `public/apple-touch-icon.png`, `public/apple-touch-icon-precomposed.png` für Browser, die die Standardpfade abfragen (ohne Datei lieferte die Auth-Middleware dort die Login-Seite als HTML).
- `logo-v2.svg` passt sich per `prefers-color-scheme` an; `logo-v2-512.png` und `.ico` (16/32/48) sind schwarz auf transparent; `logo-v2-apple.png` (180) schwarz auf weiß (iOS füllt Transparenz schwarz). Bei Formänderungen alle Dateien und die Komponente anpassen.
- E-Mail-Köpfe: `public/email/logo-schwarz.png` (480 × 480, schwarz auf weiß, ohne Text, für ca. 120 px Breite), weil Mail-Programme SVG oft nicht anzeigen.
- **PNG erzeugen:** Auf der Entwicklermaschine gibt es weder `rsvg-convert` noch ImageMagick, headless Chrome (`--screenshot`) hängt. Das SVG im Browser-Pane auf ein Canvas zeichnen (vorher den `<style>`-Block der SVG entfernen, sonst nimmt das Canvas die Farbe des Browser-Modus) und das PNG per `fetch` an einen kurzlebigen lokalen Empfänger schicken; die `.ico` per kleinem Python-Skript zusammensetzen.

## Design hell/dunkel

- Standard ist **System** (folgt dem Gerät, auch bei Wechsel zur Laufzeit); fest Hell oder Dunkel wählt der Nutzer unter „Mein Konto“ → Darstellung (`ThemeSchalter`, `src/components/theme-schalter.tsx`).
- Gespeichert nur im Cookie `theme` (`light`/`dark`/`system`, ohne Cookie = `system`; pro Browser, keine DB). Das Root-Layout setzt `data-theme` am `<html>`, ein Skript im `<head>` löst „System“ vor dem ersten Zeichnen auf — `data-theme` ist daher immer `light` oder `dark`.
- Alle Seiten sind mit den dunklen Tailwind-Klassen gebaut (`neutral-*`, `text-white`, `bg-white text-black` für Hauptknöpfe). Das helle Design kehrt in `globals.css` nur die Farbvariablen um (weiß ↔ schwarz, Neutral-Skala gespiegelt, Signalfarben wie `red-400` abgedunkelt). Neue Seiten nutzen einfach die vorhandenen Klassen.
- Stolperfallen: Hauptknöpfe (`.bg-white`) hätten durch die Umkehrung tiefschwarz — dafür gibt es eine Sonderregel (hellgrau). Das Schreiben `.druckbereich` ist Papier und setzt die Farbvariablen zurück. Farben außerhalb der Skala (Hex, `amber-700` u.ä.) werden nicht umgekehrt und müssen bei Bedarf einzeln in `globals.css` ergänzt werden.

## Formularzeilen: Felder und Knöpfe gleich groß

Dem Eigentümer wichtig, gilt für **jede neue und jede angefasste Seite**: Stehen Auswahlfelder, Eingabefelder und Knöpfe nebeneinander (Filter-/Anzeigezeilen, Formulare mit „Anzeigen“/„Speichern“), haben sie **dieselbe Höhe** (`h-10`) und, bei gleichartigen Feldern bzw. dem Knopf daneben, dieselbe Breite (z.B. `w-32`). Nicht über `py-*` steuern: Felder haben einen Rahmen (+2 px), Hauptknöpfe (`bg-white`) keinen — mit gleichem `py-2` ist der Knopf 2 px niedriger als das Feld. Muster: `src/app/(app)/jahresuebersicht/jahr-filter-form.tsx`.

- `DateInput` ist in der Standardgröße (`md`) ebenfalls `h-10`; `size="sm"` bleibt die Kompaktvariante für Tabellenzellen.
- Ausnahme: bewusst kleine Elemente in Tabellenzellen und Kompaktzeilen (`text-xs`) behalten ihre Höhe, müssen aber untereinander gleich hoch sein.
