# Kontostand: Bank-Salden aus der CAMT-XML und Abgleich mit den Buchungen

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“). Import der XML-Dateien: `docs/kontoauszug-import.md` → „CAMT-Import“; Jahresbericht und Kontenabgleich: `docs/berichte-steuer.md`.

## Grundregel

Der **echte Kontostand** kommt aus den Salden (Anfangs-/Endsaldo) der CAMT-XML-Dateien, nicht aus einer Simulation. Die Buchungen der App werden **gegen** diesen Stand geprüft — nicht umgekehrt.

## Speicherung

- Tabelle `kontosalden` (`Kontosaldo`, `src/lib/kontosalden.ts`): **eine Zeile je Buchungstag** mit Anfangssaldo, Endsaldo, Anzahl und Summe der Umsätze der Datei. Derselbe Tag wird beim erneuten Einlesen überschrieben.
- Geschrieben wird beim **Kontoauszug-Import** einer XML-Auswahl (`previewImport`, sofort beim Hochladen — es sind echte Bankwerte, unabhängig davon, ob danach gebucht wird) und über **„Salden aus XML-Dateien einlesen“** auf `/kontostand` (liest nur, bucht nichts; für Auszüge, die vor der Speicherung importiert wurden). Die XML-Dateien selbst werden nicht aufbewahrt.
- Tage ohne Umsätze haben keine Datei und keine Zeile; dort gilt der Endsaldo des letzten Tages davor.

## Abgleich auf `/kontostand`

- **Anker:** Mit Salden ist der **Endsaldo des ersten gespeicherten Tages** der Anker; ab dort rechnet die Seite die Buchungen (`standAnTagen`, dieselbe Rechnung wie `kontostandAmStichtag`) und stellt sie je Tag dem Bankstand gegenüber. Der von Hand gesetzte Anker (Objekt-Einstellungen) gilt nur ohne Salden.
- **Differenz** = Buchungen − Bank. Ändert sie sich gegenüber dem Vortag, fehlt an diesem Tag eine Buchung oder ist falsch erfasst (Filter „Hier beginnt eine Abweichung“). Eine gleichbleibende Differenz ist die Folge einer früheren Abweichung, kein neuer Fehler.
- **Lücken** (`findeSaldoLuecken`): Endsaldo eines Tages ≠ Anfangssaldo des nächsten heißt, dass dazwischen eine Tagesdatei fehlt; die Seite warnt.
- Buchungen **nach** dem letzten Bank-Tag (noch keine XML) erscheinen erst im Buchungsverlauf und in der Karte „Laut Buchungen“, nicht in der Differenz.

## Von Hand eingetragene Prüfwerte

`KontostandKontrolle` bleibt (eingeklappt auf der Seite) für Auszüge ohne XML. **Der Jahresbericht und die Verifikation nutzen weiterhin nur diese Prüfwerte**, nicht die Bank-Salden (`src/lib/jahresjournal.ts`). Die Prüfwerte rechnen gegen den von Hand gesetzten Anker, falls vorhanden.

- Verworfen: die Bank-Salden als Prüfwerte in den Jahresbericht zu übernehmen — 365 Werte je Jahr würden den Bericht überladen; sinnvoll wären nur Jahres- und Quartalsstände.
