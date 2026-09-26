# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Projekt

"Mietverwaltung Eutin": Buchhaltungs-/Verwaltungs-App für ein Mietobjekt (~63 Einheiten) mit Mietverträgen, Zahlungen, Kosten, Kautionen, Nebenkostenabrechnung, Jahresübersicht (Einnahmen-Überschuss, Anlage V) und Kontoauszug-Import. Next.js 16 (App Router, Server Actions), React 19, Prisma 7 mit `@prisma/adapter-pg`, Neon Postgres, NextAuth 4 (Credentials, Rollen `ADMIN`/`GAST`), Tailwind 4, Vercel (Blob für Belege/Fotos). UI-Texte, Kommentare und Domänenbegriffe sind Deutsch — beim Schreiben von Code/Kommentaren daran anpassen. Konversation mit dem Nutzer auf Deutsch.

## Befehle

```bash
npm run dev          # Dev-Server auf :3000 (.claude/launch.json kennt außerdem :3001)
npm run lint         # eslint
npx tsc --noEmit     # Typecheck (kein separates Skript)
npm run build        # wake-db → migrate-with-retry → next build (braucht erreichbare DB)
npx prisma migrate deploy && npx prisma generate   # Migrationen lokal anwenden, Client neu erzeugen
npx tsx scripts-tmp/xyz.ts                          # Einmal-Skripte gegen die DB (siehe unten)
```

Es gibt keine Testsuite. Verifiziert wird über `tsc`, `eslint`, `next build` und eigene `tsx`-Skripte gegen die DB; die reine Rechenlogik (`src/lib/*`) lässt sich gut direkt mit `tsx` aufrufen.

- Nach jeder Schema-Änderung `prisma generate` ausführen **und den Dev-Server neu starten** (bei Fehlern wie "Unknown field … for include" oder komischem Verhalten: laufenden `next dev` beenden, `.next` löschen, neu starten — der Server hält sonst den alten Prisma-Client).
- `tsx` lädt keine `.env`-Dateien selbst: vorher `set -a; . ./.env; set +a` (lokale DB `mietverwaltung_eutin`) bzw. `. ./.env.prod-admin.local` (Produktion, Neon) sourcen. Produktion-Skripte nur lesend, außer der Nutzer hat die konkrete Änderung ausdrücklich beauftragt.
- Temporäre Skripte gehören nach `scripts-tmp/` (nicht committen; `git add -A src prisma` statt `git add -A`).

## Deployment

Push auf `main` → Vercel baut und veröffentlicht automatisch (Repo `carlwafe/hausverwaltung`). Der Build führt `prisma migrate deploy` aus (`scripts/migrate-with-retry.mjs`, bevorzugt über Neons direkten Endpunkt ohne `-pooler`, weil die Advisory-Lock über den Pooler nach abgebrochenen Builds hängen bleibt → P1002). Deploy-Status: `npx vercel ls`, Log: `npx vercel inspect <url> --logs`. Migrationen sind handgeschriebenes SQL unter `prisma/migrations/<zeitstempel>_name/`; Schema in `prisma/schema.prisma` parallel pflegen, `prisma migrate deploy` lokal anwenden. Die Produktions-DB ist von der Entwicklermaschine aus gelegentlich nicht erreichbar (ETIMEDOUT) — dann erneut versuchen, nicht raten.

## Architektur

**Journal-Modell (Kern).** Fast alles Finanzielle ist eine Zeile in der einen Tabelle `Buchung`, typisiert durch den Katalog `Buchungsart` (Flags `kontokreis`, `zahlungswirksam`, `eurRelevant`). Beispiele: `MIETZAHLUNG`, `KOSTENPOSITION`, `KAUTION_*`, `NEBENKOSTENAUSGLEICH`, `MAHNGEBUEHR` (= Forderung an den Mieter, positiv, ohne Geldfluss, nicht EÜR), `SONDERZAHLUNG` (Zahlung darauf), `KAUTION_EINBEHALT` (negativ, nicht zahlungswirksam, EÜR-relevant). Die Seiten `zahlungen`, `kosten`, `kautionen`, `kontostand` usw. sind Sichten auf dieselbe Tabelle (`src/lib/buchungsjournal.ts`, `kontostand.ts`, `mieterkonto.ts`).

**Storno statt Ändern.** Buchungen sind unveränderlich (DB-Trigger `buchungen_unveraenderbar`, Migration `20260920190000`): kein UPDATE/DELETE, nur Verweisfelder dürfen von NULL auf einen Wert wechseln (`storniertDurchBuchungId`, `bezugTyp/bezugId`). "Bearbeiten" = `storniereBuchung` (`src/lib/buchung-storno.ts`) + Neuanlage; "Löschen" = stornieren. Jede Abfrage/Summe muss `...AKTIVE_BUCHUNG_FILTER` verwenden. Zuordnungsfelder (Gebäude/Haus/Kostengruppe/Einheit/Mietvertrag) lassen sich nachträglich nicht umhängen — ebenfalls Storno + Neuanlage. Aufteilen von Zahlungen/Kosten erzeugt Teile mit gemeinsamer `aufteilungGruppeId`; Rückgängig-Logik in `src/lib/aufteilung-aufheben.ts`.

**Vorzeichenkonventionen (Stolperfallen).** Zahlungen/Kaution/Ausgleich tragen das Bankvorzeichen (ausgehend negativ). Eine `KOSTENPOSITION` ist dagegen positiv = Ausgabe, negativ = Gutschrift (also umgekehrt zum Bankbetrag; beim Aufteilen einer Zahlung in Kosten wird das Vorzeichen gedreht). `NEBENKOSTENAUSGLEICH`: negativ = Auszahlung an den Mieter. Verrechnungen mit Nebenkostenabrechnung laufen über `src/lib/nk-verrechnung.ts` (`NK_AUSGLEICH_ODER_VERRECHNUNG`, `nkBegleichung`): Zuordnung zur Abrechnung über Mietvertrag + Jahr (nicht Positions-ID, die sich bei "Neu berechnen" ändert).

**Nebenkostenabrechnung.** `src/lib/nebenkostenabrechnung.ts` ist eine reine Funktion (`berechneNebenkostenabrechnung`): Kostenpools je Kostenkreis (Objekt/Haus/Gebäude/Kostengruppe/Einheit), Verteilung nach Wohnfläche/Einheiten/Verbrauch/extern vorverteilt (Techem), Restcent-Ausgleich, Zeitanteil pro Mietvertrag, Vorauszahlung aus den tatsächlichen Mietzahlungen (je Monat zuerst NK-Vorauszahlung bis zum NK-Soll, Rest auf die Kaltmiete — § 366 Abs. 2 BGB; NK-Anteil von Zahlungen außerhalb des Mietzeitraums und mit Guthaben verrechneter Rückstand zählen mit). Die Daten lädt `ladeBerechnungsdaten` in `nebenkostenabrechnungen/actions.ts`; gespeichert werden nur die Ergebnispositionen, die nach Regeländerungen erst durch "Neu berechnen" aktualisiert werden. Stern/Kommentar-Spalten hängen an Abrechnung + Mietvertrag (Tabelle `NebenkostenabrechnungPruefung`), damit sie "Neu berechnen" überleben. Die Vergleichsrechnung "wie Verwalter" (`NebenkostenQmAbweichung`) wirkt nur live auf der Detailseite.

**Kontoauszug-Import** (`src/app/(app)/kontoauszug/import`, Logik in `src/lib/import/`): CSV/Excel-Zeilen werden über `bank-csv.ts`, `zahlungen-import.ts`, `kosten-import.ts` klassifiziert und in `buchung-klassifizierung.ts` zu einem Buchungsart-Vorschlag pro Zeile vereinheitlicht; Duplikate werden gegen bestehende Buchungen erkannt.

**Schreibende Aktionen.** Server Actions (`"use server"`-Dateien `actions.ts` neben den Seiten) beginnen mit `requireEditor()` (`src/lib/session.ts`; `GAST` = nur lesen), rufen nach dem Schreiben `revalidatePath` für alle betroffenen Seiten auf. Formulare: entweder `useActionState` + `runFormAction` (werfende Aktionen) oder Aktionen, die `string | null` zurückgeben. Wiederverwendbare UI: `DataTable` (Sortierung/Suche/Filter/Auswahl), `DateInput` (Datum mit Auto-Sprung), `SubmitButton`, `DeleteButton` (ist selbst ein `<form>` — nicht in andere Formulare schachteln), `MietvertragAuswahl` (Suchauswahl für beliebige `{id,label}`-Listen). Auth-Schutz für alle Routen über `src/proxy.ts` (NextAuth-Middleware).

**Sortierung.** Einheiten/Gebäude/Häuser werden nicht alphabetisch, sondern in der Haus-Reihenfolge des Objekts sortiert (`einheit-sort.ts`, `sort-einheiten.ts`, `gebaeude-gruppen.ts`).

## Arbeitsweise in diesem Repo

- Änderungen werden nach Verifikation (`tsc`, `eslint`) direkt committet und nach `main` gepusht; Commit-Nachrichten deutsch.
- Änderungen an Produktionsdaten (Buchungen, Verträge) erst nach ausdrücklicher Freigabe des Nutzers; vorher immer den Ist-Zustand lesend prüfen.
