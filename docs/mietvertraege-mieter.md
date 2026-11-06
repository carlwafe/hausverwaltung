# Mietverträge, Mieter und Objektdaten

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Kontaktdaten und Bankverbindung des Objekts

**Kontakt** (Seite `/objekt`, Abschnitt „Kontakt“; `Objekt.telefonMieter`, `emailVerwaltung`, `emailMieter`): Telefonnummer für Mieter und zwei E-Mail-Adressen — `emailMieter` für Rückfragen der Mieter, `emailVerwaltung` für Dienstleister/Behörden. Alle optional, E-Mail-Format wird geprüft. Die Werte stehen nur in der DB — **nicht im Code festschreiben**; wer sie ausgibt (Schreiben, E-Mail-Köpfe `public/email/`), liest sie aus `Objekt`. Die PDF-Schreiben im Layout „klar“ tun das; das Anpassungsschreiben (`anpassungsschreiben.tsx`) merkt sich die Absenderdaten weiter im Browser.

**Bankverbindung des Mietkontos** (Abschnitt „Bankverbindung Mietkonto“; `Objekt.mietkontoInhaber`, `mietkontoIban`, `mietkontoBic`, `mietkontoBank`): Konto, auf das die Mieter zahlen. Nur Information, ohne Wirkung auf Buchungen; IBAN mit Prüfziffer geprüft und ohne Leerzeichen gespeichert, BIC auf Aufbau. Das Anpassungsschreiben nennt das Konto bei Zahlungsweg Überweisung (nicht bei Lastschrift oder Amt); ohne erfasstes Konto entfällt der Zusatz. Kostet etwa eine Zeile der A4-Seite — Seitenlänge prüfen. Kautions-/Objektkonto sind nicht erfasst.

## Mieter

**Mieternamen.** Der Vorname ist optional: Firmen/Genossenschaften/Behörden mit leerem Vornamen und vollem Namen inkl. Rechtsform im Nachnamen erfassen (sortiert dann richtig). Namen nie als `` `${m.vorname} ${m.nachname}` `` zusammensetzen, sondern `mieterName()` / `mieterNameNachnameZuerst()` aus `src/lib/mieter-name.ts` verwenden (sonst führende Leerzeichen bzw. "Firma, " in Listen).

**Postanschrift** (`Mieter.anschriftStrasse`, `anschriftPlz`, `anschriftOrt`, alle optional): neue Anschrift ausgezogener Mieter und Wohnort externer Garagenmieter, die nicht im Objekt wohnen. Im Mieterformular als Block „Postanschrift“; die Aktion verlangt alle drei Teile oder keinen. Das BK-Schreiben (`nk-schreiben-laden.ts`) setzt sie bei beendeten Verträgen als Empfänger (erste vollständige Anschrift der Mieter des Vertrags), ohne Anschrift bleibt der Platzhalter „[neue Anschrift ergänzen]“. Mieter im Objekt brauchen keine: ihre Anschrift ist die Einheit. Die Anschrift gehört an den Mieter, nicht in die Vertragsnotiz. Auch das Garagen-Schreiben (Skript) liest sie aus dem Mieter.

**Mieter-Status.** Kein Feld in der DB, sondern aus den Mietverträgen abgeleitet (`ladeMieter` in `mieter/page.tsx`): Aktiv = mindestens ein Vertrag `AKTIV`, Geplant = nur `GEPLANT`, sonst Inaktiv. Spalte und Filter in `mieter-table.tsx`.

**„Amt zahlt“** (früher Häkchen „Bürgergeld-Empfänger“): kein eigenes Feld, sondern aus `Mietvertrag.zahlungsweg` abgeleitet (`istAmtZahler`, `src/lib/amt-zahlt.ts`): mindestens ein laufender oder geplanter Vertrag mit Zahlungsweg `BEHOERDE`. Wirkt auf die blaue Zeilenfarbe in Mieter- und Einheitenliste, die Anzeige „Miete zahlt das Amt“ im Mieterformular (nur lesend) und den Weiterleiten-Hinweis im Anpassungsschreiben (`jobcenter` in `anpassung-laden.ts`). Gepflegt wird der Wert nur am Mietvertrag (bzw. über die Warnung „Zahlungsweg prüfen“ beim Import, siehe `docs/zahlungen-kautionen.md`). Die Spalte `Mieter.buergergeldEmpfaenger` ist ungenutzt und kann entfernt werden (zwei Deploys: erst Code, dann `DROP COLUMN`).

## Mietvertrag

**Notiz** (`Mietvertrag.notiz`): interner Freitext (max. 2.000 Zeichen), z.B. für Mitbewohner, die nicht im Vertrag stehen. Erfasst nur in „Mietvertrag bearbeiten“/„Neuer Mietvertrag“; die Vertragsseite zeigt sie nur, wenn sie nicht leer ist, als Zeile in den Vertragsdaten (`EckdatenSektion`). Keine Wirkung auf Berechnungen, nicht in Listen. Verworfen: eigene, direkt speicherbare Box auf der Vertragsseite (dem Eigentümer zu präsent).

## Buchhaltungs-Stichtag je Mietvertrag

`Mietvertrag.buchhaltungAb` (optional). Global gilt `Objekt.buchhaltungAb` (01.01.2025). Ein Vertrag, dessen Zahlungen und Sonderbuchungen ab einem früheren Datum **vollständig** erfasst sind, kann einen eigenen früheren Stichtag bekommen („Buchhaltung ab (optional)“ unter Mietvertrag bearbeiten), damit Jahres-/Quartalsübersicht, Offene Posten, Mieterkonto und Dashboard auch seine früheren Jahre rechnen.

- **Immer `effektiverStichtag(vertrag, objekt)`** verwenden (`src/lib/buchhaltung-stichtag.ts`: `vertrag.buchhaltungAb ?? objekt.buchhaltungAb`), **nie** `objekt.buchhaltungAb` direkt. Jeder Aufrufer von `berechneSoll`/`sollAufschluesselung`/`berechneIstNachPeriode`/`unbezahlteNkVorauszahlung` übergibt den effektiven Stichtag je Vertrag; `ladeSonderforderungSalden` bekommt ihn über `abJeVertrag` (Map Vertrag → Stichtag), `berechneMieterBericht` liest ihn aus `MietvertragFuerJahresbericht.buchhaltungAb`.
- Der eigene Stichtag ist **nur früher** als der des Objekts zulässig (die Aktion lehnt gleich/später ab). Empfohlen wird der Monatserste (Soll und Zahlungen zählen monatsweise, Sonderbuchungen ab dem genauen Tag). Wird der Objekt-Stichtag später auf oder hinter den eines Vertrags verschoben, bleibt der eigene wirksam; beim nächsten Speichern verlangt die Aktion, das Feld zu leeren.
- **Saldovortrag** gilt zum *effektiven* Stichtag. Stolperfalle: Wer einen früheren Stichtag setzt und den Saldovortrag stehen lässt, rechnet die Zeit dazwischen falsch — das Formular warnt bei geändertem Stichtag und Saldovortrag ≠ 0. Bei vollständiger Erfassung ab dem neuen Stichtag ist er meist 0, sonst „Saldo alt“ aus dem Verwalterbericht zu diesem Datum.
- **Gemischte Stichtage:** Summenzeilen von Jahres-/Quartalsübersicht und Offenen Posten mischen dann Stichtage (gewollt); Verträge mit eigenem Stichtag sind mit „Stichtag TT.MM.JJJJ“ gekennzeichnet, die Mieter-Tabelle nennt die Anzahl in der Fußzeile, die Vertragsseite „Buchhaltung ab“. Die Kennzeichnung läuft über den Loader (`hatEigenenStichtag`), **nicht** über ein Feld in `MieterJahresberichtZeile` (sonst ändert sich die JSON-Ausgabe von `quartal-app.ts`).
- Die Nebenkostenabrechnung kennt keinen Stichtag; nur die Gegenrechnung der unbezahlten NK-Vorauszahlung gilt ab dem Stichtag des Vertrags.
- **Vor dem Setzen in der Produktion** die Wirkung ansehen: `scripts-tmp/quartal-app.ts` und `scripts-tmp/stichtag-seiten.ts` (nur lesend) rechnen mit `STICHTAG_TEST="<mietvertragId>=2023-01-01"` einen Testwert, ohne etwas zu schreiben.

## Garagen

### Umsatzsteuer: keine (Kleinunternehmerregelung)

Der Steuerberater hat bestätigt: Garagen an externe Mieter sind grundsätzlich umsatzsteuerpflichtig (§ 4 Nr. 12 Satz 2 UStG; Wohnung mit Garage als Nebenleistung steuerfrei, UStAE 4.12.2), die Vermieterin nimmt aber seit 2023 die Kleinunternehmerregelung in Anspruch (§ 19 UStG; seit 2025: 25.000 € Vorjahresumsatz, 100.000 € im laufenden Jahr); die Erklärungen 2023 und 2024 sind so eingereicht. Folgen:

- Garagenverträge werden **ohne Umsatzsteuer** geführt (`Mietvertrag.mehrwertsteuer` = 0, bei Garagen Pflichtfeld; das Formular bietet „0 € eintragen“ an). In Verträgen und Zahlungsaufforderungen keine Umsatzsteuer ausweisen (üblich: „Kein Ausweis der Umsatzsteuer nach § 19 UStG“).
- Wer Umsatzsteuer ausweist, schuldet sie, bis der Ausweis korrigiert ist (§ 14c UStG); Rechnungen mit Umsatzsteuer an Mieter sind zu korrigieren (gleiche Nummer, „Rechnungskorrektur“). Ob die frühere Verwaltung solche Rechnungen gestellt hat, ist angefragt.
- **Erstattung:** Die seit 2023 gezahlte Umsatzsteuer wird an die Mieter erstattet und ab Dezember 2026 keine mehr erhoben (vom Steuerberater bestätigt) — umgesetzt über das Garagen-Schreiben (verrechnet mit der BK-Nachzahlung 2025, siehe `docs/schreiben-mieter.md` → „Schreiben an die Garagenmieter“).
- **Offen:** Die Bestandsverträge stehen in der App noch auf 9,50 € (19 % von 50 €), und die Lastschriften müssen vor dem Dezember-Einzug auf 50 € umgestellt werden. Stolperfalle: `mehrwertsteuer` am Vertrag auf 0 zu setzen senkt auch das Soll der vergangenen Monate (die gezahlten 9,50 € wirken dann als Guthaben); `Mieterhoehung` kennt keine Mehrwertsteuer. Wie die Umstellung in der App erfolgt und wie die Erstattung in der Anlage V behandelt wird, mit Eigentümer und Steuerberater klären, erst dann Produktionsdaten ändern.

### Vertragsformular

Die Garagenverträge nutzen **nicht** alle dasselbe Formular:

- **Garagen 1, 2 (aktueller Mieter), 5, 8:** Muster „Mietvertrag für Garagen“ der bisherigen Verwaltung (2023–2025), unbefristet, Kündigungsfrist drei Monate.
- **Garagen 4 und 7:** ältere Fassung desselben Musters (2002 bzw. 2007).
- **Garagen 3 und 9:** Garagenmietvertrag der GWL Lübeck (1998/1999, Miete in DM, ohne Umsatzsteuer, Kündigungsfrist drei Monate).
- **Garage 6:** Formular von 1978 (Miete in DM, Kündigungsfrist 30 Tage zum Monatsende).
- Die Heizkosten-Klausel der alten Formulare gilt nur bei beheizbaren Boxen; hier ohne Bedeutung.

Die Vertragsdaten (Beginn, Miete, Umsatzsteuer) der vorliegenden Verträge gelten als Referenz für die App; eine Abweichung ist ein Erfassungsfehler, kein fachlicher Sonderfall (siehe „Beim Erfassen prüfen“).

**Mietentwicklung der Bestandsgaragen.** Die Mieten 2, 3 und 9 wurden 2019 einvernehmlich (schriftliche Zustimmung des Mieters) auf 50 € netto ohne Umsatzsteuer angehoben; die Anpassungsvereinbarungen für 4, 6 und 7 liegen nicht vor, dort stehen 2020 ebenfalls 50 € netto. Die Garagen 4, 6 und 7 wurden bereits vor 2023 mit Umsatzsteuer (19 %, 2020 zeitweise 16 %) abgerechnet — die Erstattung der Umsatzsteuer „seit 2023“ (siehe oben) deckt für sie vermutlich nicht den ganzen Zeitraum ab; mit dem Steuerberater klären. Nicht vorliegend: Erstvertrag Garage 2 (1987), Vertrag des Vormieters der Garage 8; ein Aktenvermerk von 1969 zur früheren Hauswartgarage ist nur historisch.

- **§ 3 Nr. 4** verlangt die Umsatzsteuer „zusätzlich“ (Miete netto, Steuernummer eingetragen) — passt nicht zur Kleinunternehmerregelung; bei künftigen Verträgen weglassen bzw. anpassen.
- **§ 3 Nr. 3:** Umlage der Betriebskosten vereinbart, Vorauszahlung/Pauschale leer (siehe `docs/nebenkosten.md` → „Betriebskosten der Garagen“).
- **Betriebskosten im Vertrag:** Umlage klar vereinbart nur im Muster 2007–2025 (Garagen 1, 2, 5, 7, 8; bei Garage 7 steht sie in § 3 Nr. 2). **Keine Umlage:** Garage 3 und 9 (GWL-Vertrag, nur „Mietzins“, also Pauschalmiete) und Garage 6 (Vertrag von 1978, nur Miete). **Eingeschränkt:** Garage 4 (2002: Miete inkl. Umsatzsteuer, nur Erhöhungen/Neueinführungen nach Vertragsschluss umlagefähig). Die Anpassungsschreiben von 2019 sprechen von „in den Mieten bereits vereinbarten Betriebskosten“ (Inklusivmiete). Auf eine Umlage für 2025 wird verzichtet (`docs/nebenkosten.md` → „Betriebskosten der Garagen“); sollte künftig umgelegt werden, nur bei den Verträgen mit klarer Klausel.
- **§ 4** (Kaution) leer — ohne eingetragenen Betrag keine Kaution bzw. NK-Vorauszahlung in der App anlegen.
- **§ 11** schließt das Wohnraummietrecht aus (Vertrag unabhängig von einem Wohnraummietverhältnis).
- **Keine Indexmiete** (§ 13 leer): §§ 557b/558 BGB gelten nicht, eine Mieterhöhung geht nur mit Zustimmung oder per Änderungskündigung. Garagen bleiben deshalb aus der Mieterhöhungs-Liste heraus.
- **Beim Erfassen prüfen:** Vertragsbeginn im Vertrag gegen die App (Beginn und erste Zahlung können abweichen), Mehrwertsteuer in der App 0 €.
- **„Garage Nr.“ im Vertrag** bezeichnet die Garagenanlage, die Einheit ergibt sich aus „Box Nr.“ (z.B. „Garage Nr. 1, Box Nr. 8“ = Einheit „Garage 8“). Fehlt die Box-Nummer, die Einheit aus dem Dateinamen bzw. Vorgänger-Vertrag ableiten.
- **Wechsel des Mieters:** Endet ein Vertrag am Monatsletzten und beginnt der Nachfolger laut Vertrag früher, überlappen sich die Zeiträume — Beginn/Ende gegen den Vertrag prüfen und klären, bei wem der Übergangsmonat gebucht wird.
