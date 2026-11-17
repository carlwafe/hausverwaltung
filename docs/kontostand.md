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

## Darstellung (Reiter, Zeitraum, Seitenaufteilung)

- Die Seite zeigt oben die Kopfkarten und die Lücken-Warnung, darunter vier Reiter: **Abweichungen** (nur Tage mit neuer Abweichung, über alle Zeiträume; beim Öffnen vorgewählt, wenn es welche gibt, sonst das Diagramm), **Diagramm**, **Tagesstände Bank** und **Buchungsverlauf**. Der Reiterwechsel läuft im Browser (kostet keine Serverzeit); gezeichnet wird nur der offene Reiter.
- **Diagramm** (`kontostand-chart.tsx`, SVG ohne Bibliothek): Bankstand (durchgezogen) und Stand laut Buchungen (gestrichelt, liegt oben) je Bankstand-Tag auf einer Zeitachse; rote Punkte markieren Tage, an denen eine neue Abweichung beginnt, und decken sich beide Linien, sieht man nur Bank mit Strichen darüber. Fahren/Tippen zeigt Tag, beide Stände und Differenz. Zeichenbreite = Breite des Platzes, damit die Schrift auf dem Handy lesbar bleibt. Es folgt dem Zeitraumfilter.
- **Zeitraum** (30 Tage, 90 Tage — Standard —, 1 Jahr, Alles) gilt für Tagesstände und Buchungsverlauf und ist ein Link (`?zeitraum=…&ansicht=…`): Der Server schickt nur die Zeilen des Zeitraums, weil jede Zeile Ladezeit kostet. „Kontostand danach“ und die Differenz bleiben über den ganzen Verlauf gerechnet.
- Beide Tabellen zeigen am Computer zunächst 50 Zeilen (`zeilenSchritt` an der `DataTable`) mit „Weitere anzeigen“/„Alle anzeigen“; Suche und Filter durchsuchen alle Zeilen des Zeitraums.
- **Server:** Anker, Tagesabgleich und der Stand vor dem Zeitraum rechnet die Datenbank als **Tagessummen** (`ladeKontostandTagessummen`, ein Eintrag je Buchungstag); einzeln geladen werden nur die Buchungen des Zeitraums (`ladeKontostandEintraege(ab)`, `berechneKontostandVerlaufAb`). Das Ergebnis ist mit der Rechnung über alle Einzelbuchungen identisch, solange Anker, Stichtage und Zeitraum auf ganze Tage zeigen. Die Jahresübersicht nutzt weiter `ladeKontostandEintraege()` ohne Zeitraum.

## Keine Prüfwerte von Hand mehr

Das frühere Formular „Kontostand von Hand prüfen“ ist entfernt; die Tabelle `kontostand_kontrollen` (Modell `KontostandKontrolle`) ist ungenutzt und kann in einem eigenen Deploy gelöscht werden. Der Jahresbericht stimmt den Endbestand nur noch mit der Verifikation des Kontenabgleichs ab (`src/lib/jahresjournal.ts`); ohne sie ist er rein rechnerisch (der Bericht sagt das).

- Verworfen: die Bank-Salden als Prüfwerte in den Jahresbericht zu übernehmen — 365 Werte je Jahr würden den Bericht überladen; sinnvoll wären nur Jahres- und Quartalsstände.
