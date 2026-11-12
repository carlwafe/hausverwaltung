# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Projekt

"Mietverwaltung Eutin": Buchhaltungs-/Verwaltungs-App für ein Mietobjekt (~63 Einheiten) mit Mietverträgen, Zahlungen, Kosten, Kautionen, Nebenkostenabrechnung, Jahresübersicht (Einnahmen-Überschuss, Anlage V) und Kontoauszug-Import. Next.js 16 (App Router, Server Actions), React 19, Prisma 7 mit `@prisma/adapter-pg`, Neon Postgres, NextAuth 4 (Credentials, Rollen `ADMIN`/`GAST`), Tailwind 4, Vercel (Blob für Belege/Fotos). UI-Texte, Kommentare und Domänenbegriffe sind Deutsch — beim Schreiben von Code/Kommentaren daran anpassen. Konversation mit dem Nutzer auf Deutsch.

## Fachdokumentation (docs/)

Die Fachregeln, Entscheidungen und Stolperfallen je Bereich stehen in `docs/`. **Vor Arbeiten in einem Bereich die passende Datei lesen** (Read-Tool); sie sind bewusst nicht in dieser Datei, damit der Kontext schlank bleibt. Neue fachliche Entscheidungen gehören in die passende Datei dort (siehe „Arbeitsweise“).

| Datei | Inhalt |
|---|---|
| `docs/lokal-testen.md` | Seiten und Kontoauszug-Import lokal im Browser prüfen, Testnutzer, Browser-Pane-Kniffe, Testdaten wieder entfernen. |
| `docs/deployment-vercel.md` | Vercel-CPU-Kontingent: Regeln, damit Seiten und Server Actions wenig CPU kosten. |
| `docs/nebenkosten.md` | Berechnung, Gegenrechnung der unbezahlten Vorauszahlung, Versanddatum, manuelle/berechnete Positionen, Verrechnungen, Betriebskosten der Garagen. |
| `docs/schreiben-mieter.md` | Indexmiete, NK-Anpassung, Layout „klar“, BK-Abrechnung als PDF, Arbeitskosten (§ 35a), Mahnung/Kündigung, Garagen-Schreiben, Mietrechtsreform. |
| `docs/mietvertraege-mieter.md` | Kontaktdaten und Bankverbindung des Objekts, Mieternamen, Notiz, Mieter-Status, Garagen (Umsatzsteuer, Vertragsformular), Buchhaltungs-Stichtag je Vertrag. |
| `docs/zahlungen-kautionen.md` | Kommentar zur Buchung, Kautionen, Zahlungsweg, Tilgungsreihenfolge, Mietperiode der Zahlung, Gebühren und Rücklastschriften. |
| `docs/sepa-lastschrift.md` | Gläubiger-ID, Mandate, Mandatsseite, Einzugsdatei pain.008, Auszug lesen. |
| `docs/berichte-steuer.md` | Jahres-/Quartalsübersicht, Aufstellung für die Steuererklärung, Jahresbericht Kontoführung (PDF), Anschaffung/AfA, Kontenrahmen. |
| `docs/darlehen.md` | Zins/Tilgung-Buchung, Zuordnung zum Darlehen, Tilgungsplan-Rechnung, Soll/Ist-Darlehenskonto, Jahreswerte „Zinsen von anderen Konten“. |
| `docs/kontoprognose.md` | Kontoprognose: Bedienung, Annahmen (Miete, Kosten, Darlehensraten, Weiterleitung, Nebenkostenausgleich), Mindestbestand. |
| `docs/kontoauszug-import.md` | Klassifizierung, Mahngebühren, CAMT-Import, Doppelzahlungs-Prüfung, Vollständigkeits-Check, Import-Verwaltung, KI-Prüfung. |
| `docs/kosten-dienstleister.md` | Stadtwerke-Salden, Dienstleister-Stammdaten, Anwaltskosten, Grundsteuer-Rate, Winterdienst/Hauswart, Heizungswartung, Leerstand-Seite. |
| `docs/dokumente.md` | Ablage und Hauptordner, Bezüge, Dokumenttyp/Labels, Erkennung (Regeln/KI, Sammel-PDFs, Versorger-Salden), Zuordnung, Belegprüfung und Belegpflicht. |
| `docs/tickets-logo-design.md` | Ticket-System, Logo und Icons, App auf dem Home-Bildschirm (PWA), Darstellung hell/dunkel, gleich große Felder/Knöpfe in Formularzeilen. |
| `docs/abgleich-vorverwalter.md` | Altdaten vor Buchhaltungsbeginn, PDF→CSV der PowerHaus-Berichte, Quartalsvergleich App ↔ PDF, Kostenabgleich. |

## Befehle

```bash
npm run dev          # Dev-Server auf :3000 (.claude/launch.json kennt außerdem :3001)
npm run lint         # eslint
npx tsc --noEmit     # Typecheck (kein separates Skript); prüft auch scripts-tmp/ — Fehler dort (alte Einmalskripte mit veralteten Signaturen) ignorieren, nur Fehler in src/ zählen
npm run build        # wake-db → migrate-with-retry → next build (braucht erreichbare DB); lokal scheitert der Typcheck-Schritt an denselben scripts-tmp-Altlasten — als Prüfung genügt „Compiled successfully“ (Vercel hat scripts-tmp nicht)
npx prisma migrate deploy && npx prisma generate   # Migrationen lokal anwenden, Client neu erzeugen
npx tsx scripts-tmp/xyz.ts                          # Einmal-Skripte gegen die DB (siehe unten)
```

Es gibt keine Testsuite. Verifiziert wird über `tsc`, `eslint`, `next build` und eigene `tsx`-Skripte gegen die DB; die reine Rechenlogik (`src/lib/*`) lässt sich gut direkt mit `tsx` aufrufen.

- **Dev-Server neu starten** nach jeder Schema-Änderung (`prisma generate`) und nach einem Branch-Wechsel — der laufende `next dev` hält den alten Prisma-Client bzw. zeigt neue Seiten nicht (Fehler wie "Unknown field … for include": Server beenden, `.next` löschen, neu starten). Next erlaubt nur **einen** `next dev` je Ordner (Lock in `.next/dev`): Hält ein anderer Chat den Server, scheitert `preview_start` auch mit :3001 ("Another next dev server is already running") — dann den Nutzer fragen, ob der Server (PID aus der Meldung) neu gestartet werden darf, nicht eigenmächtig beenden. Ein frischer Server kompiliert Login und Seiten beim ersten Aufruf langsam (nach dem Anmelden 10 s warten, ggf. zweimal).
- `tsx` lädt keine `.env`-Dateien selbst: vorher `set -a; . ./.env; set +a` (lokale DB `mietverwaltung_eutin`) bzw. `. ./.env.prod-admin.local` (Produktion, Neon) sourcen.
- Die `.env*`-Dateien (`.env`, `.env.local`, `.env.prod-admin.local`) sind git-ignoriert und liegen im Hauptordner `/Users/felixwaller/Claude Projects/Neuer Ordner/`; nur `.env.example` ist eingecheckt. `.worktreeinclude` kopiert die drei Dateien in neue Worktrees (auch die Produktions-Zugangsdaten); fehlen sie, per absolutem Pfad sourcen, z.B. `set -a; . "/Users/felixwaller/Claude Projects/Neuer Ordner/.env.prod-admin.local"; set +a`. Der Ordner `/Users/felixwaller/qwer/Neuer Ordner` ist kein Repo — im Hauptordner arbeiten.
- Temporäre Skripte gehören nach `scripts-tmp/` (in `.gitignore`). Gleiche Skriptnamen überschreiben sich zwischen parallelen Chats (z.B. `testnutzer.ts`): eigene Namen mit Präfix verwenden und vor dem Aufruf kurz lesen, was die Datei tut.
- Lokal im Browser prüfen und Testdaten entfernen: `docs/lokal-testen.md`.

## Git bei parallelen Chats

Im Hauptordner arbeiten oft mehrere Chats gleichzeitig. Deshalb:

- Vor Branch-Wechsel, Löschen oder Push `git fetch` + `git status`. Fremde nicht committete Änderungen nicht anfassen (kein `stash`/`checkout --`/`reset`). Branches nur löschen, wenn `git log origin/main..<branch>` leer ist; auf einen anderen Branch nur wechseln, wenn er auf denselben Commit wie `HEAD` zeigt.
- Vor dem Push `git log origin/main..HEAD --oneline` prüfen: Es dürfen nur die eigenen Commits drinstehen — Commits anderer Chats nicht mitpushen (Nutzer fragen, nicht eigenmächtig pushen).
- Gezielt stagen: `git add -A src prisma` plus bei Bedarf `CLAUDE.md`, `docs/`, `package.json`/`package-lock.json`, `scripts/`, `.gitignore` — nie `git add -A`.
- Danach immer `git diff --cached --name-only` prüfen: `git add -A src prisma` nimmt auch **nicht committete Dateien anderer Chats** mit. Fremde Dateien mit `git restore --staged <datei>` herausnehmen; bei gemischten Hunks nur den eigenen Teil stagen (HEAD-Stand + eigene Änderung in eine Temp-Datei, `git hash-object -w <datei>`, `git update-index --cacheinfo 100644,<blob>,<pfad>`).
- **Neue Dateien zuerst oder gemeinsam committen und pushen:** Importiert eine bestehende Datei eine neue, kann ein anderer Chat die geänderte Datei ohne die neue pushen — der Vercel-Build scheitert.
- **Schema und Migration immer im selben Commit** (oder die Migration zuerst): Sonst nimmt ein anderer Chat `prisma/schema.prisma` mit deinen Spalten ohne die Migration mit, und die Produktion fragt fehlende Spalten ab (P2022). In der Schema-Datei **kein `prisma format`** (formatiert die ganze Datei um, Konflikte mit anderen Chats).
- Heredocs mit Backticks immer als `<<'EOF'` (sonst führt die Shell `` `…` `` aus und verschluckt das Wort) und danach prüfen.

## Deployment

Push auf `main` → Vercel baut und veröffentlicht automatisch (Repo `carlwafe/hausverwaltung`). Der Build führt `prisma migrate deploy` aus (`scripts/migrate-with-retry.mjs`, bevorzugt über Neons direkten Endpunkt ohne `-pooler`, weil die Advisory-Lock über den Pooler nach abgebrochenen Builds hängen bleibt → P1002). Deploy-Status: `npx vercel ls`, Log: `npx vercel inspect <url> --logs`. Migrationen sind handgeschriebenes SQL unter `prisma/migrations/<zeitstempel>_name/`; Schema in `prisma/schema.prisma` parallel pflegen.

- Die Produktions-DB ist von der Entwicklermaschine aus gelegentlich nicht erreichbar (ETIMEDOUT) — erneut versuchen, nicht raten.
- Fehler aus Server Actions zeigt der Browser in Produktion nur als "Minified React error #441"; die echte Meldung steht in den Runtime-Logs: `npx vercel logs --environment production --since 1h -q <pfad> -x` (SSL-"SECURITY WARNING"-Zeilen sind harmlos).
- **Spalten entfernen braucht zwei Deploys:** Die Migration läuft im Build, bevor die neue Version live ist — die alte Version fragt eine gelöschte Spalte noch ab (P2022). Erst den Code deployen, der die Spalte nicht mehr nutzt, dann `DROP COLUMN` in einem eigenen Push. Neue nullable Spalten sind unkritisch.
- Hängt eine Advisory-Lock (P1002 in allen 5 Versuchen): Ursache ist eine `idle`-Verbindung eines abgebrochenen Builds (`select l.pid, a.state from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory'`). Nur mit ausdrücklicher Freigabe des Nutzers per `pg_terminate_backend(pid)` beenden, danach `npx vercel redeploy <url>`.
- **Vercel-Kontingent** (Free-Tarif, 4 h „Fluid Active CPU“ pro Monat, Stichtag der 8.): vor neuen Tabellen-Links, Inline-Aktionen auf schweren Seiten oder neuen schweren Seiten `docs/deployment-vercel.md` lesen.

## Architektur

**Begriffe.** `Haus` = physisches Bauwerk (in der UI „Gebäude“; fasst ggf. mehrere Hausnummern zusammen, optional), `Gebaeude` = Hausnummer/Adresse, `Einheit` hängt an `Gebaeude` (Hierarchie `Haus` → `Gebaeude` → `Einheit`). Bei „Gebäude/Haus“ in dieser Datei im Zweifel das Modell meinen.

**Journal-Modell (Kern).** Fast alles Finanzielle ist eine Zeile in der einen Tabelle `Buchung`, typisiert durch den Katalog `Buchungsart` (Flags `kontokreis`, `zahlungswirksam`, `eurRelevant`). Beispiele: `MIETZAHLUNG`, `KOSTENPOSITION`, `KAUTION_*`, `NEBENKOSTENAUSGLEICH`, `MAHNGEBUEHR` (= Sonderforderung auf dem Mieterkonto, ohne Geldfluss, nicht EÜR; positiv = Forderung, Vorzeichen allgemein = Wirkung aufs Mietkonto), `SONDERZAHLUNG` (Zahlung darauf), `KAUTION_EINBEHALT` (negativ, kein Bankfluss, EÜR-relevant). Die Seiten `zahlungen`, `kosten`, `kautionen`, `kontostand` usw. sind Sichten auf dieselbe Tabelle (`src/lib/buchungsjournal.ts`, `kontostand.ts`, `mieterkonto.ts`).

**Storno statt Ändern.** Buchungen sind unveränderlich (DB-Trigger `buchungen_unveraenderbar`, Migration `20260920190000`): kein UPDATE/DELETE, nur Verweisfelder dürfen von NULL auf einen Wert wechseln (`storniertDurchBuchungId`, `bezugTyp/bezugId`). "Bearbeiten" = `storniereBuchung` (`src/lib/buchung-storno.ts`) + Neuanlage; "Löschen" = stornieren. Jede Abfrage/Summe muss `...AKTIVE_BUCHUNG_FILTER` verwenden. Zuordnungsfelder (Gebäude/Haus/Kostengruppe/Einheit/Mietvertrag) lassen sich nachträglich nicht umhängen — ebenfalls Storno + Neuanlage. Aufteilen von Zahlungen/Kosten erzeugt Teile mit gemeinsamer `aufteilungGruppeId`; Rückgängig-Logik in `src/lib/aufteilung-aufheben.ts`, Aufteilen/Rückgängig über die Detailseite der Buchung (in Tabellen mit ✂ gekennzeichnet). Stolperfalle bei einer gemischten Aufteilung (Miete + Kostenposition, z.B. Rücklastschriftgebühr): Rückgängig muss den Kosten-Teil mit umgekehrtem Vorzeichen zurückrechnen und eine daran verknüpfte Gebühren-Forderung mitstornieren.

**Checkliste: Was beim Ersetzen per Storno mitwandern muss.** Weil Zusatzdaten in eigenen Tabellen an der Buchungs-ID hängen, muss **jeder** Weg, der eine Buchung per Storno + Neuanlage ersetzt (Bearbeiten, Umbuchen, Aufteilen, Aufteilung rückgängig, Monat ändern …), sie mitnehmen — wer einen neuen Weg einbaut, geht diese Liste durch:
- Zahlung: Kommentar → `uebernehmeBuchungKommentar` (`src/lib/buchung-kommentar.ts`; beim Aufteilen nur auf die Zahlungsteile).
- Kostenposition: Belege → `dokument.updateMany({ where: { buchungId } })`; mitbenutzte Belege → `verlegeMitbenutzteBelege` und „Kein Beleg nötig“ → `uebernehmeBelegAusnahme` (beide `src/lib/beleg-status.ts`); Arbeitskosten § 35a → `uebernehmeArbeitskosten` (`src/lib/arbeitskosten.ts`, anteilig nach Betrag); `bezugsbereitAb` übernehmen (AfA).
- Verknüpfte Buchungen: `storniereBuchung` storniert die Gegen-Kostenposition einer Kautions-Verrechnung mit Rechnung und den Zinsanteil einer Darlehenstilgung automatisch mit; Gebühren-Forderungen einer gemischten Aufteilung nicht (siehe oben).
- Nicht automatisch: Ticket-Kosten (`ticket_kosten`) fallen aus dem Ticket und müssen neu verknüpft werden.

**Wer hat gebucht.** `Buchung.erstelltVon` (Benutzerkennung, `benutzerLabel()` in `src/lib/session.ts`) wird bei jeder Neuanlage **und** jedem Storno auf den ausführenden Nutzer gesetzt — neue Aufrufstellen, die `Buchung` erzeugen oder `storniereBuchung` aufrufen, müssen es mitgeben (nicht-optionaler Parameter). Einen Stornogrund gibt es bewusst nicht. Angezeigt auf den Detailseiten über `BuchungsartInfo` (Props `erstelltAm`/`erstelltVon`, `src/components/buchungsart-info.tsx`; auf `/kautionen/buchung/[id]` als eigene Zeile „Erstellt“); Altbestand ohne Kennung zeigt nur das Datum.

**Vorzeichenkonventionen (Stolperfallen).** Zahlungen/Kaution/Ausgleich tragen das Bankvorzeichen (ausgehend negativ). Eine `KOSTENPOSITION` ist dagegen positiv = Ausgabe, negativ = Gutschrift (umgekehrt zum Bankbetrag; beim Aufteilen einer Zahlung in Kosten wird das Vorzeichen gedreht). `NEBENKOSTENAUSGLEICH`: negativ = Auszahlung an den Mieter. Verrechnungen mit Nebenkostenabrechnung laufen über `src/lib/nk-verrechnung.ts` (`NK_AUSGLEICH_ODER_VERRECHNUNG`, `nkBegleichung`): Zuordnung zur Abrechnung über Mietvertrag + Jahr (nicht Positions-ID, die sich bei "Neu berechnen" ändert). Der gespeicherte `saldo` einer Abrechnungsposition ist Vorauszahlung − Kosten (positiv = Guthaben); der Reiter "Nebenkostenabrechnung" der Mietvertragsseite zeigt ihn umgekehrt als Kosten − Vorauszahlung (gespeichert +120 € = dort −120 € Guthaben).

**Schreibende Aktionen.**
- Server Actions (`"use server"`-Dateien `actions.ts` neben den Seiten) beginnen mit `requireEditor()` (`src/lib/session.ts`; `GAST` = nur lesen) und rufen nach dem Schreiben `revalidatePath` für alle betroffenen Seiten auf. Formulare: `useActionState` + `runFormAction` oder Aktionen, die `string | null` zurückgeben.
- Meldungen für den Nutzer nie mit `throw new Error` (Produktion überträgt nur den Digest), sondern `throw new AktionsFehler("…")` bzw. `throw zodFehler(parsed.error)` (`src/lib/aktion.ts`) in einer Aktion `export const x = mitMeldung(async function x(…) { … })`. Nur Aktionen umschließen, deren Rückgabewert ausgewertet wird (`runFormAction`, `useActionState`) — bei `<form action>`/Buttons ohne Auswertung würde die Meldung verschluckt.
- Viele Einzel-Updates in einer `prisma.$transaction` überschreiten über Neon das 5-s-Limit (P2028, alles zurückgerollt) — nach Zielwert gruppieren und per `updateMany` schreiben (Beispiel `speichereAnreden` in `mieter/actions.ts`).
- **Felder und Knöpfe in einer Zeile immer gleich hoch (`h-10`) und gleich breit** (Details und Begründung: `docs/tickets-logo-design.md`) — bei neuen und angefassten Formularen mit beachten.
- Wiederverwendbare UI: `DataTable` (Sortierung/Suche/Filter/Auswahl), `DateInput`, `SubmitButton`, `DeleteButton` (ist selbst ein `<form>` — nicht schachteln), `MietvertragAuswahl` (Suchauswahl für `{id,label}`-Listen). Suchauswahl: Das Panel darf bei Scroll/Resize nicht schließen, sondern muss sich neu positionieren (Handy-Tastatur löst beides aus); eine vorgefilterte Liste gehört in `defaultKandidaten`, `kandidaten` bleibt die volle Liste (sonst findet die Namenssuche nichts außerhalb der Vorauswahl).
- Client-Komponenten dürfen nichts importieren, was Prisma zieht (Turbopack liefert sonst nur „ENOENT build-manifest.json“) — Anzeige-Helfer stehen deshalb in eigenen Dateien ohne Prisma (z.B. `dokumente-anzeige.ts`, `beleg-anzeige.ts`).
- Auth-Schutz für alle Routen über `src/proxy.ts` (NextAuth-Middleware).
- Tab-Titel setzt `NavBar` clientseitig aus `SEITENTITEL` in `src/components/nav-bar.tsx` (längster passender Pfad, kein Next-`metadata`) — **neue Seiten dort eintragen**. Next setzt den Titel bei jeder Navigation (auch bei Suchparametern) neu; `NavBar` zieht ihn deshalb per `MutationObserver` auf `document.head` nach.

**Sortierung.** Einheiten/Gebäude/Häuser werden nicht alphabetisch, sondern in der Haus-Reihenfolge des Objekts sortiert (`einheit-sort.ts`, `sort-einheiten.ts`, `gebaeude-gruppen.ts`).
- Tabellen: Gibt das `sortValue` einer `DataTable`-Spalte den Bezeichnungstext zurück, sortiert sie alphabetisch ("HS 15" vor "HS 9") — für Einheiten-Spalten im Server den Rang mit `sortEinheitenNachGebaeude` berechnen (Abfrage braucht `einheit.gebaeude.haus.gebaeude`) und als Zahl mitgeben (Beispiel `einheitRang` in Offene Posten). Ohne aktive Spaltensortierung behält die `DataTable` die Reihenfolge der übergebenen Zeilen.
- Auswahllisten: Einheiten über `sortEinheitenNachGebaeude`, Adressen über `sortGebaeudeNachHaus` (`src/lib/sort-gebaeude.ts`), Häuser über `vergleicheHaus` — nie `localeCompare` auf dem Label ("Haus 10" vor "Haus 2"). Die Kosten-Auswahl (`gruppiereGebaeude`) braucht `haus: { include: { gebaeude: true } }` in der Abfrage.
- Bewusst alphabetisch bleiben Namenslisten (Kostenarten, Mieter nach Nachname, Dienstleister).

## Arbeitsweise in diesem Repo

- Änderungen werden nach Verifikation (`tsc`, `eslint`) direkt committet und nach `main` gepusht (löst den Produktions-Deploy samt `prisma migrate deploy` aus); Commit-Nachrichten deutsch. Migrationen, die bestehende Daten ändern oder löschen, vor dem Push zeigen und freigeben lassen.
- Hinweistexte in der App kurz halten (1–3 Sätze je Punkt, längere in `<details>`); Detailregeln und Beispiele gehören nach `docs/`.
- Wird eine fachliche/buchhalterische Entscheidung getroffen (z.B. wie ein Sonderfall gebucht wird), am Ende der Aufgabe nachfragen, ob sie dokumentiert werden soll: **in der App** (Hinweistext an der passenden Stelle) **und in der passenden Datei unter `docs/`**. Regeln für `docs/`: kurz, mit `##`-Abschnitten statt Riesenabsätzen; **keine Mieternamen oder andere personenbezogenen Daten** (Beispiele anonym mit Beträgen); geltende Regel statt Verlauf (verworfene Varianten nur als „Verworfen: X, weil Y“); keine Zahlenstände mit Datum, die schnell veralten; ein Beispiel nur an einer Stelle, sonst verweisen. `CLAUDE.md` bleibt schlank (Befehle, Kernarchitektur, Arbeitsregeln); neue `docs/`-Dateien in der Tabelle oben ergänzen.
- Änderungen an Produktionsdaten (Buchungen, Verträge, Skripte gegen die Produktions-DB, `pg_terminate_backend`) erst nach ausdrücklicher Freigabe des Nutzers für die konkrete Änderung; vorher immer den Ist-Zustand lesend prüfen. Produktions-Skripte sonst nur lesend.
- Änderungen an Rechenregeln der NK-Engine: vorher mit einem Leseskript in `scripts-tmp/` (Engine-Kopie mit neuer Regel vs. `src`, gleiche Daten aus `ladeBerechnungsdaten`) zeigen, welche Positionen sich wie ändern. Gespeicherte Abrechnungen ändern sich erst durch "Neu berechnen" — bei bereits verschickten Abrechnungen braucht der betroffene Mieter eine korrigierte Fassung.
- Änderungen an den Erkennungsregeln des Kontoauszug-Imports (`src/lib/import/*`): vorher/nachher mit einem Leseskript in `scripts-tmp/` gegen die bestehenden Buchungen prüfen. Alle aktiven Buchungen mit `rohdaten` (`AKTIVE_BUCHUNG_FILTER`, sonst zählen Storno-Gegenbuchungen doppelt) durch die neue Regel schicken (Verwendungszweck und Bankbetrag aus den Rohdaten, nicht `Buchung.betrag`) und die Treffer mit der tatsächlich gebuchten Art/Kostenart vergleichen: Jeder abweichend gebuchte Treffer ist ein Widerspruch zur bisherigen Praxis (Regel anpassen oder Entscheidung klären), jede so gebuchte, aber nicht erkannte Zeile eine Lücke. Vorher in `docs/` und den Hinweistexten der App nachsehen, ob die Praxis schon festgehalten ist.
- Altdaten des Vorverwalters (Kautionen, Mietbeginn/-ende vor dem Buchhaltungsbeginn) und Abgleich mit seinen Berichten: `docs/abgleich-vorverwalter.md`.
