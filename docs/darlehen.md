# Darlehen (Mietkonto, Tilgungspläne, Darlehenskonto)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Darlehensrate buchen (Zins + Tilgung)

Seit November 2026 werden die Darlehen der Vermieterin (für das Objekt aufgenommen) per Lastschrift vom Mietkonto abgebucht, eine Abbuchung je Darlehen und Monat. Eine Rate besteht aus **Zinsen** (Werbungskosten, Schuldzinsen der Anlage V, nicht umlagefähig) und **Tilgung** (kein Aufwand, mindert nur die Restschuld) und wird in zwei Buchungen mit denselben Rohdaten geteilt (`src/lib/darlehen.ts`):

- **Zins** = `KOSTENPOSITION` (positiv = Ausgabe) einer Kostenart mit Einordnung `SCHULDZINSEN` (Kostenart-Formular „Schuldzinsen“; die Aktion lehnt „umlagefähig“ ab). Raten unter „Darlehenszinsen“, Verzugszinsen/Gebühren der Bank unter „Verzugszinsen“ — beides steuerlich Schuldzinsen, in der Anlage nach Kostenart getrennt sichtbar.
- **Tilgung** = Buchungsart `DARLEHEN_TILGUNG` (Objektkonto, zahlungswirksam, **nicht EÜR-relevant** — wie die Mietweiterleitung: bewegt den Kontostand, im Kontenabgleich durchlaufender Posten, nie in Kosten/EÜR/Überschuss). Die Tilgung **nie als Kostenart** buchen.
- Der Zins verweist per `bezugTyp = "Darlehensrate"`/`bezugId` auf die Tilgung (nicht per `aufteilungGruppeId`, weil „Aufteilung rückgängig“ das falsch zusammenführen würde). `storniereBuchung` nimmt beim Storno der Tilgung den Zins mit, umgekehrt nicht — eine Rate über die Seite „Darlehen“ löschen.
- **Reines Zinsdarlehen** (Rate = Monatszins): nur die Zinsbuchung (`teileDarlehensrate` erlaubt Zins = Rate); sie ist selbst Anker der Zuordnung und steht mit Tilgung 0 € auf `/darlehen`.

**Erfassung im Kontoauszug-Import:** Buchungsart-Familie „Darlehensrate (Zins + Tilgung)“ (`BuchungsartGruppe` `DARLEHEN`). Der Nutzer trägt den **Zinsanteil laut Tilgungsplan** ein und wählt die Schuldzinsen-Kostenart (bei genau einer vorbelegt; bei zwei je Zeile wählen); der Rest der Bankzeile ist Tilgung, ohne Zinsanteil ist alles Tilgung (Sondertilgung). Art „Sonderbuchung (z.B. Verzugszinsen)“: ganzer Betrag ist Zins, keine Tilgung, kein Monat.
- **Zinsvorschlag:** `previewImport` liefert die Plan-Raten der laufenden Darlehen (Vorjahr bis Folgejahr, `ladeDarlehenPlanRaten`, `src/lib/darlehen-plan.ts`); `findePlanRate` (`src/lib/darlehen-plan-match.ts`, ohne Prisma) belegt Zinsanteil, Darlehen und Monat vor, wenn die Abbuchung zu **genau einer** Plan-Rate passt (Betrag auf den Cent, Zahltag höchstens 10 Tage entfernt); darunter „Tilgungsplan … Zinsen … ✓“ bzw. „übernehmen“. Kein Treffer (Sondertilgung, geänderter Zins, zwei Darlehen mit gleicher Rate) → Zinsanteil von Hand.
- **Darlehen der Rate** (Dropdown, Pflicht solange aktive Darlehen existieren, serverseitig geprüft): vorbelegt aus der Plan-Rate oder über `erkenneDarlehen` (`src/lib/darlehen-erkennung.ts`): Ziffern der Darlehensnummer im Zweck oder die letzten 9 Ziffern der Empfänger-IBAN, nur bei eindeutigem Treffer (Deutsche Bank: Kontonummer „0“ + Nummer ohne „730“, z.B. „730 8080822 96“ ↔ …0808082296).
- **Duplikate:** Die Bankzeile gilt über ihre Rohdaten als importiert; beim Commit zusätzlich Datum + Verwendungszweck gegen vorhandene Raten (der Tilgungsbetrag ist nur der Rest). Der Vollständigkeits-Check zählt `DARLEHEN_TILGUNG` als „sonstige“ und Buchungen mit `bezugTyp = "Darlehensrate"` als aufgeteilt.
- **Noch manuell:** die Wahl der Familie „Darlehensrate“ — eine automatische Erkennung der Lastschriften erst nach Sichtung der echten Zeilen und Rückwärtstest ergänzen. Ebenso fehlt das Zuordnen geparkter Buchungen/Kosten → Neu zu einer Darlehensrate.

**Zinsanteil prüfen:** Plan-Zinsen der enthaltenen Monate (`zinsenJeMonat`) + Aufschlag. Beispiel: Eine Überweisung über Rate Oktober + 2 Rückstandsraten + 59,92 € Verzugszinsen hatte als Zinsanteil 843,11 € Plan-Zinsen + 59,92 € — auf den Cent gleich. Ein Rückstand ist nur eine verspätet gezahlte Rate; die Zinsen zählen im Jahr der Zahlung (§ 11 EStG).

## Zuordnung zum Darlehen und Seite „Darlehen“

`/darlehen` (Menü Finanzen): je Jahr Raten, Zinsen, Tilgung und die einzelnen Raten; Löschen storniert beide Teile; Kontostand-Kategorie „Darlehenstilgung“.

- **Darlehen je Rate** (Tabelle `darlehen_zuordnungen`, `DarlehenZuordnung`; eigene Tabelle, da Buchungen unveränderlich): Anker ist die **Tilgung**, bei reiner Zinsbuchung der Zins. `ordneDarlehenZu` setzt/ersetzt/entfernt, `legeDarlehensrateAn` legt sie beim Import an. Nachträglich über die Spalte „Darlehen“ (Dropdown, speichert sofort, `ordneDarlehensrateZu`); Raten ohne Darlehen sind amber markiert. Auch reine Zinsbuchungen (z.B. eine als Kosten importierte Rate) erscheinen dort und lassen sich löschen und neu als Darlehensrate erfassen.
- Stolperfalle: Die Zuordnung hängt an der Buchung — wird nur die Zinsbuchung bearbeitet, bleibt sie an der Tilgung; nach dem Löschen einer Rate bleibt eine inaktive Zuordnungszeile stehen (zählt nirgends).
- **Mehrere Inhaber:** Die Darlehen laufen auf die Vermieterin **und eine weitere Person** — ob die Zinsen vollständig bei der Vermieterin abziehbar sind, klärt der Steuerberater.

## Zinsen von anderen Konten (Jahreswerte)

Raten, die vor dem Wechsel aufs Mietkonto von einem anderen Konto gezahlt wurden, stehen nicht im Journal. Stattdessen trägt man auf `/darlehen` je Darlehen und Jahr den **Zinsanteil** als Jahreswert ein (`SchuldzinsenJahreswert`: Jahr, Darlehen per Dropdown — höchstens ein Eintrag je Darlehen und Jahr, erneutes Speichern ersetzt —, Betrag, optional Zeitraum `vonMonat`/`bisMonat`, Bemerkung; keine Buchung; `speichereSchuldzinsenJahreswert`/`loescheSchuldzinsenJahreswert`). Verworfen: Zins/Tilgung als Buchung mit Gegen-„Einlage“ (aufwendig, fachlich nicht nötig).

- **Nur den nicht über das Mietkonto gezahlten Anteil** eintragen, sonst zählen Zinsen doppelt. Stolperfalle: Über das Mietkonto nachgezahlte **Rückstände** früherer Monate stecken schon im Zinsanteil — den Zeitraum entsprechend kürzen.
- **Betragsvorschlag:** Sind alle Raten des Jahres einem Darlehen zugeordnet und die Bankwerte erfasst, gilt **Bankbescheinigung − Zinsen über das Mietkonto** (`mietkontoZinsen`). Sonst Summe der Plan-Zinsen im gewählten Zeitraum (`zinsenJeMonat`, `src/lib/darlehen-zinsen.ts`; Standard: Januar bis Monat vor der ersten Mietkonto-Rate; Monate ohne Plan-Rate werden gemeldet). Überschreibbar, „Plan-Wert übernehmen“.
- **Maßgeblich ist am Jahresende die Bankbescheinigung:** Die Seite zeigt je Darlehen deren Jahreszinsen und die Kontrolle „gesamt = Mietkonto + andere Konten“ (grün bei Übereinstimmung, erst wenn für alle aktiven Darlehen ein Wert erfasst ist).
- In der Aufstellung für die Steuererklärung zählen sie zu den Kosten (`schuldzinsenAndere`, Anlage und CSV listen sie, `schuldzinsenAndereZeilen`), **nicht** im Jahresbericht, Kontostand oder Kontenabgleich — die Überleitung hat die Zeile „Abzüglich Schuldzinsen von anderen Konten“. Geladen nur im Gesamtjahr.
- **Offen für 2026:** Jahreswerte je Darlehen eintragen (Zeiträume je nach Wechsel aufs Mietkonto) und im Januar 2027 gegen die Bescheinigungen der Bank prüfen.

## Darlehen & Tilgungspläne (Stammdaten)

`/darlehen/tilgungsplan`, Tabelle `darlehen`. Die Bank druckt im Zins- und Tilgungsplan nur die ersten Jahre einzeln, danach nur Jahressummen. Die Seite rechnet **jede Rate nach** (`berechneTilgungsplan`, `src/lib/tilgungsplan.ts`, reine Funktion):

- Zins = Restschuld vor der Rate × Zinssatz ÷ 12, kaufmännisch auf Cent (Ganzzahl-Cent, kein Gleitkomma); Tilgung = Rate − Zins; letzte Rate tilgt genau den Rest. Zahltag = 15., am Wochenende der Montag.
- Liegt das Laufzeitende nach dem Zahltag seines Monats, rechnet die Bank eine **halbe Rate** zum Laufzeitende dazu (halber Monatszins, Tilgung bis zur halben Rate, abgerundet) — abgebildet.
- Geprüft (`scripts-tmp/tp-test-darlehen.ts`): alle Raten und Jahressummen der Bankpläne und die Bescheinigungen 2025 stimmen auf den Cent.

**Eingabe je Darlehen:** Restschuld nach der letzten bekannten Rate + Stichtag (z.B. „Kapitalstand“ im Plan oder Saldenmitteilung — jährlich neu setzen bei Sondertilgungen/Abweichungen), Rate, Zinssatz, Zahltag, Zinsbindung bis, Laufzeitende, **Zinsstufen** (`stufen` JSON: ab Datum neuer Zinssatz, optional neue Rate; danach „*“ = Zinssatz angenommen) und **Bankwerte** (`bankwerte` JSON: Jahr, Zinsen, Tilgung, Restschuld laut Bescheinigung; je Jahr „stimmt ✓“ oder „Abweichung“, Toleranz 2 Cent).
- Ändert die Bank Zinssatz oder Rate, die Stufe eintragen — sonst weichen Plan und Vorschläge ab.
- Die Jahreszinsen sind die der **im Jahr gezahlten** Raten, nicht die aufgelaufenen.
- Inaktive Darlehen stehen am Ende und zählen nicht in die Summen; längst aufgelöste Darlehen gar nicht anlegen.
- Reine Auskunft: Die Seite schreibt nichts ins Journal.

**Stolperfallen:** Bei Bauspar-/Vorausdarlehen weicht der Plan am Ende ab (Halbraten bei Rückzahlung) — verlässlich ist die Rechnung bis zum Ende der Zinsbindung. Der Anschlusszinssatz steht in keinem Dokument und ist nur aus der Bescheinigung rückrechenbar (z.B. 1,39 % → ≈ 3,89 % nach Ablauf).

## Darlehenskonto (Soll/Ist) und Zahlungsseite

Auf `/darlehen/tilgungsplan` (Darlehen anklicken) steht je Jahr ein Konto wie das Mieterkonto: Monatszeilen mit **Soll** (Rate, Zins, Tilgung laut Plan) und **Ist** (über das Mietkonto gebuchte Rate), Restschuld Plan gegen Restschuld nach gebuchten Tilgungen, Status „gebucht ✓“ / „Abweichung“ / „offen – nicht gebucht“ / „steht aus“ / „anderes Konto“; die Übersicht hat die Spalte „Konto“ (offene Monate).
- Ist erst ab `MIETKONTO_AB` = 11/2026 (`src/lib/darlehenskonto.ts`); Rechnung `baueDarlehenskonto` (reine Funktion), Ist-Daten `ladeDarlehenIst` (`darlehenskonto-laden.ts`, nur aktive Buchungen).
- **Monat der Rate:** `DarlehenZuordnung.periodeJahr/periodeMonat` (ohne Angabe: Buchungsmonat), im Import je Zeile wählbar und auf der Zahlungsseite änderbar (ohne Storno). Bewusst an der Zuordnung statt an `Buchung.periodeMonat`, damit keine Mietperioden-Abfrage die Raten mitzählt.
- **Sonderbuchung** (`DarlehenZuordnung.sonder`): steht nur unter „Sonderbuchungen“, nicht im Soll/Ist-Vergleich.

**Zahlungsseite** `/darlehen/rate/[id]` (id = Tilgung bzw. bei Sonderbuchung/reinem Zins die Zinsbuchung; Aktionen in `darlehen/rate/actions.ts`): Betrag, Zins/Tilgung, Darlehen, Monat ändern (`aendereRateMonat`) und **Aufteilen auf mehrere Monate** (`teileRateAufMonate`), wenn eine Zahlung mehrere Raten abdeckt.
- Aufteilen = Storno + Neuanlage je Monat (gleiche Rohdaten, gemeinsame `aufteilungGruppeId`, Darlehen und Monat je Teil); Summe muss der Zahlung entsprechen; Zinsanteile aus dem Plan vorbelegt. Ein Teil kann eine **Sonderbuchung** sein („+ Sonderbuchung hinzufügen“) — so trennt man Rate + Verzugszinsen in einem Schritt.
- „Aufteilung rückgängig machen“ (`fasseRatenZusammen`) bucht die Summe als eine Rate im ersten Monat neu. Der Kontostand bleibt jeweils unverändert.
- Stolperfalle: Danach ist die alte Zahlungsseite 404 (Original storniert) — die Formulare leiten aufs Darlehenskonto weiter. Eine Rate am falschen Darlehen ändert man über das Dropdown auf `/darlehen`.
