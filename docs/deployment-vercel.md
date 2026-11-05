# Vercel-Kontingent (Fluid Active CPU)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Rahmen

Free-Tarif, „Fluid Active CPU“: 4 h pro Abrechnungszeitraum, Stichtag jeweils der 8. des Monats. Bei 100 % pausiert Vercel die Projekte bis zum Stichtag (oder sofort nach Wechsel auf Pro). Der Verbrauch folgt der Nutzung (Spitzen an Arbeitstagen, Wochenenden nahe 0); es gibt keine Cron-Jobs oder Polling. Im Oktober 2026 lag er bei rund 7 min pro Tag und damit nahe am Limit.

**Beobachten:** Team → Usage → Fluid Active CPU (Verlauf je Tag); Routen-Aufschlüsselung unter Projekt → Observability → Vercel Functions, im Free-Tarif nur für die letzten 12 h. `npx vercel usage` liefert 404. Größte Verbraucher waren `/mietvertraege/[id]`, `/api/auth/[...nextauth]`, `/zahlungen/[id]`, `/jahresuebersicht`, `/mietvertraege/moegliche-erhoehungen`, `/kontoauszug/import`.

## Regeln für neuen Code

- **Kein Prefetch an Tabellen- und Navigationslinks:** Zeilen-Links haben `prefetch={false}` (sonst lädt jede sichtbare Zeile die dynamische Detailseite vor). Neue Tabellen-Links ebenso setzen.
- **Kein `SessionProvider`:** Er rief `/api/auth/session` bei jedem Seitenaufruf ab (≈ 16 % der CPU). `signIn`/`signOut` aus `next-auth/react` brauchen ihn nicht — wer `useSession` einführt, braucht ihn wieder.
- **Schwere Berichte erst auf Knopfdruck:** Die Jahresübersicht zeigt beim Öffnen nur die Auswahl und rechnet erst nach „Anzeigen“; Dropdowns senden nicht automatisch ab. Neue schwere Seiten ebenso bauen.
- **Bankzeile nicht mitladen:** Die Listen Zahlungen und Kosten (auch auf Einheit/Haus/Gebäude/Objekt) laden `Buchung.rohdaten` (≈ die Hälfte der Datenmenge) nicht (`omit`), die Zeile kennt nur `hatRohdaten` (`idsMitRohdaten`, `src/lib/rohdaten-vorhanden.ts`); beim Aufklappen holt `RohdatenNachladenZeile` sie per `ladeBuchungRohdaten`. Neue Listen mit Rohdaten-Spalte ebenso bauen. Noch nicht umgestellt: Kautionen, Nebenkostenausgleich, Mietweiterleitungen.
- **Server Actions rendern die Seite neu:** Ein `revalidatePath` auf die aktuelle Seite berechnet die ganze Seite im Action-Response neu — auf schweren Seiten eine volle Berichtsberechnung pro Klick. Inline-Aktionen dort halten ihren Zustand selbst (Aktion liefert den neuen Zustand, kein `revalidatePath`), wie Stern und Kommentarfeld der Jahresübersicht und der Nebenkostenabrechnung (`VerwalterAbgleichStern`/`KommentarFeld` in `pruefung-zellen.tsx`).

## Offen

- Ob Prefetching die Hauptursache war, ist nicht belegt — nach einem normalen Arbeitstag die Aufrufe von `/mietvertraege/[id]` und nextauth im Dashboard vergleichen.
- Falls der Monatsverbrauch weiter bei ≈ 3½ h liegt: Ergebnisse der schweren Seiten (Jahres-/Quartalsübersicht, Mieterkonto, NK-Ansicht) zwischenspeichern und beim Schreiben per `revalidatePath`/Tag ungültig machen (größerer Umbau).
