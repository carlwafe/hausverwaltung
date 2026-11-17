# Vercel-Kontingent (Fluid Active CPU)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Rahmen

Free-Tarif, „Fluid Active CPU“: 4 h pro Abrechnungszeitraum, Stichtag jeweils der 8. des Monats. Bei 100 % pausiert Vercel die Projekte bis zum Stichtag (oder sofort nach Wechsel auf Pro). Der Verbrauch folgt der Nutzung (Spitzen an Arbeitstagen, Wochenenden nahe 0); es gibt keine Cron-Jobs oder Polling. Im Oktober 2026 lag er bei rund 7 min pro Tag und damit nahe am Limit.

**Beobachten:** Team → Usage → Fluid Active CPU (Verlauf je Tag); Routen-Aufschlüsselung unter Projekt → Observability → Vercel Functions, im Free-Tarif nur für die letzten 12 h. `npx vercel usage` liefert 404. Größte Verbraucher waren `/mietvertraege/[id]`, `/api/auth/[...nextauth]`, `/zahlungen/[id]`, `/jahresuebersicht`, `/mietvertraege/moegliche-erhoehungen`, `/kontoauszug/import`.

## Regeln für neuen Code

- **Kein Prefetch an Tabellen- und Navigationslinks:** Zeilen-Links haben `prefetch={false}` (sonst lädt jede sichtbare Zeile die dynamische Detailseite vor). Neue Tabellen-Links ebenso setzen.
- **Kein `SessionProvider`:** Er rief `/api/auth/session` bei jedem Seitenaufruf ab (≈ 16 % der CPU). `signIn`/`signOut` aus `next-auth/react` brauchen ihn nicht — wer `useSession` einführt, braucht ihn wieder.
- **Schwere Berichte erst auf Knopfdruck:** Die Jahresübersicht zeigt beim Öffnen nur die Auswahl und rechnet erst nach „Anzeigen“; Dropdowns senden nicht automatisch ab. Neue schwere Seiten ebenso bauen (Beispiel: die Kontoprognose `/kontoprognose`, die erst nach „Prognose berechnen“ rechnet).
- **Bankzeile nicht mitladen:** Die Listen Zahlungen, Kosten (auch auf Einheit/Haus/Gebäude/Objekt), Betriebskostenausgleich und Mietweiterleitungen laden `Buchung.rohdaten` (≈ die Hälfte der Datenmenge) nicht (`omit`), die Zeile kennt nur `hatRohdaten` (`idsMitRohdaten`, `src/lib/rohdaten-vorhanden.ts`); beim Aufklappen holt `RohdatenNachladenZeile` sie per `ladeBuchungRohdaten`. Neue Listen mit Rohdaten-Spalte ebenso bauen. Noch nicht umgestellt: Kautionen.
- **Server Actions rendern die Seite neu:** Ein `revalidatePath` auf die aktuelle Seite berechnet die ganze Seite im Action-Response neu — auf schweren Seiten eine volle Berichtsberechnung pro Klick. Inline-Aktionen dort halten ihren Zustand selbst (Aktion liefert den neuen Zustand, kein `revalidatePath`), wie Stern und Kommentarfeld der Jahresübersicht und der Betriebskostenabrechnung (`VerwalterAbgleichStern`/`KommentarFeld` in `pruefung-zellen.tsx`). Solche Aktionen rufen `requireEditor({ startseiteUnberuehrt: true })` auf — das normale `requireEditor()` verwirft den Zwischenspeicher der Startseite und löst damit dasselbe Neu-Rendern aus (siehe unten).
- **Lange Tabellen seitenweise zeichnen:** Zahlungen, Kosten, Betriebskostenausgleich und Mietweiterleitungen zeigen am Computer zunächst 100 Zeilen (`zeilenSchritt` an `DataTable`); Suche, Filter, Summen und Auswahl gelten weiter für alle Zeilen. Alles zu laden bleibt Absicht — eine Suche über den Server würde pro Eingabe CPU kosten.
- **Globale Suche der Startseite** (`/api/suche`, `src/components/globale-suche.tsx`): läuft erst nach Tipppause (300 ms) und ab 2 Zeichen, höchstens 6 Treffer je Gruppe, nur die Trefferspalten (nie `rohdaten`), Dokumente und Buchungen erst ab 3 Zeichen. Keine Vorabfrage, kein Prefetch an den Treffer-Links. Neue Gruppen ebenso schlank halten (`take`, `select`).

## Zwischenspeicher der Startseite

Die Kacheln der Startseite brauchen die Mietzahlungen aller Verträge. Die Werte liegen deshalb im Datencache von Next (`src/lib/startseite-cache.ts`, Rechnung in `src/lib/startseite-werte.ts`); ein weiterer Aufruf der Startseite kostet keine Datenbankabfrage.

- **Verwerfen:** `requireEditor()` verwirft den Speicher bei jeder schreibenden Aktion — zentral, damit keine Aktion es vergessen kann. Schreibt eine Aktion über `requireAdmin`/`requireUser` etwas, das die Startseite zeigt, ruft sie `verwerfeStartseiteCache()` selbst auf (Beispiel `updateObjekt`).
- **Ausnahme:** Aktionen, die nichts an den Kachelwerten ändern **und** die Seite bewusst nicht neu rendern (Nachlade-Aktionen, Stern/Kommentar, KI-Prüfung), nehmen `requireEditor({ startseiteUnberuehrt: true })`. Im Zweifel die Option weglassen: Das kostet nur ein Neu-Rendern, eine falsche Ausnahme zeigt dagegen alte Zahlen.
- **Schlüssel:** Tag und Deployment gehören zum Schlüssel — am nächsten Tag und nach jedem Deploy wird neu gerechnet. Die Ticket-Kachel wird je Nutzer gespeichert (private Tickets).
- **Stolperfalle:** Änderungen an der App vorbei (Skripte gegen die DB) verwerfen nichts; die Startseite zeigt sie erst nach der nächsten Schreibaktion, dem nächsten Deploy oder am nächsten Tag.
- **Nur in Aktionen:** `requireEditor` darf nur in Server Actions laufen, nicht beim Rendern einer Seite (Next lehnt das Verwerfen dort ab).

## Offen

- Ob Prefetching die Hauptursache war, ist nicht belegt — nach einem normalen Arbeitstag die Aufrufe von `/mietvertraege/[id]` und nextauth im Dashboard vergleichen.
- Falls der Monatsverbrauch weiter bei ≈ 3½ h liegt: Ergebnisse der schweren Seiten (Jahres-/Quartalsübersicht, Mieterkonto, BK-Ansicht) zwischenspeichern und beim Schreiben per `revalidatePath`/Tag ungültig machen (größerer Umbau).
