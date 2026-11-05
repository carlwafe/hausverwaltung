# Lokal testen: Browser-Prüfung, Testnutzer, Testbuchungen entfernen

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Seiten lokal im Browser prüfen

Alle Routen liegen hinter dem Login, und im Seed steht nur ein zufälliges, nicht festgehaltenes Passwort.

- Per `tsx`-Skript gegen die **lokale** DB einen temporären Nutzer anlegen (`prisma.user.upsert`, E-Mail `…@localhost.test`, zufälliges Passwort mit `bcryptjs` gehasht). Rolle `GAST` reicht zum Ansehen; `/objekt` und andere Admin-Seiten brauchen `ADMIN`.
- Das Passwort nur in eine Datei im Scratchpad schreiben; danach den Nutzer löschen und alle dabei geänderten Testwerte zurücksetzen.
- Die Sitzung ist ein JWT-Cookie und überlebt das Löschen des Nutzers.
- Rollenwechsel (GAST → ADMIN): vorher abmelden (`/api/auth/signout`; der Knopf reagiert im Browser-Pane nicht — `document.querySelector('form').submit()` geht) und neu anmelden, sonst leitet `requireAdmin` auf `/` um.
- Nach dem Anmelden warten, bevor man die nächste Seite aufruft (frischer Server: bis 10 s).
- Nach `prisma migrate deploy && prisma generate` den Dev-Server neu starten — ein laufender `next dev` hält den alten Client (Fehler „Cannot read properties of undefined“ bei neuen Modellen).

## Browser-Pane-Kniffe

- **`<select>` in React-Formularen:** `form_input` löst kein React-`onChange` aus (Wert steht im DOM, der State bleibt leer und wird beim ersten Absenden zurückgesetzt). Stattdessen per `Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set` setzen und ein `change`-Ereignis auslösen.
- **Datei-Upload ohne Dateidialog** (z.B. Kontoauszug-Import): `new File([csv], …)` in ein `DataTransfer` legen, `input#file.files = dt.files`, `change`-Ereignis auslösen und „Datei analysieren“ klicken. CSV-Spalten: Buchungstag, Begünstigter / Zahlungspflichtiger, Verwendungszweck, IBAN, Betrag.

## Testbuchungen lokal wieder entfernen

Buchungen lassen sich wegen des Triggers `buchungen_unveraenderbar` nicht löschen. Nach einem Test gegen die **lokale** DB (nie gegen die Produktion!) in einer Transaktion:

1. `alter table buchungen disable trigger buchungen_unveraenderbar;`
2. `storniertDurchBuchungId` der Test-Zeilen auf NULL setzen.
3. Abhängige Zeilen (z.B. `darlehen_zuordnungen`) und die Buchungen löschen. Test-Zeilen an einer eigenen `erstelltVon`-Kennung erkennen (z.B. `tp-test`).
4. `enable trigger` und prüfen (`select tgenabled …` = `O`).

Dazu den Testnutzer, die hochgeladene Test-CSV (`var/storage/`) und den `import_batches`-Eintrag löschen.
