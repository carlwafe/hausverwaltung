# Nebenkostenabrechnung (Engine, Versand, Verrechnungen)

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Berechnung

`src/lib/nebenkostenabrechnung.ts` ist eine reine Funktion (`berechneNebenkostenabrechnung`): Kostenpools je Kostenkreis (Objekt/Haus/Gebäude/Kostengruppe/Einheit), Verteilung nach Wohnfläche/Einheiten/Verbrauch/extern vorverteilt (Techem), Restcent-Ausgleich, Zeitanteil pro Mietvertrag. Die Daten lädt `ladeBerechnungsdaten` in `nebenkostenabrechnungen/actions.ts`; gespeichert werden nur die Ergebnispositionen.

- **Vorauszahlung** = NK-Anteil der tatsächlichen Mietzahlungen, strikt monatsweise nach Mietperiode: Ein Rückstand kürzt nur den NK-Anteil seines Monats, und nur wenn weniger als Kalt + NK gezahlt wurde. Aufteilung einer Teilzahlung bis Mietjahr 2024 „NK zuerst“, ab 2025 anteilig — siehe `docs/zahlungen-kautionen.md` → „Tilgungsreihenfolge“. NK-Anteil von Zahlungen außerhalb des Mietzeitraums und ein mit Guthaben verrechneter Rückstand zählen mit. Monat ohne Zahlung → 0 € NK.
- **Mietperiode maßgeblich** (`periodeJahr/periodeMonat`), nur ohne sie der Monat des Buchungsdatums — eine im Januar gezahlte Dezembermiete ohne Periode fehlt in der Abrechnung des Vorjahres.
- Nach Regeländerungen ändern sich gespeicherte Positionen erst durch "Neu berechnen".
- Stern/Kommentar-Spalten hängen an Abrechnung + Mietvertrag (`NebenkostenabrechnungPruefung`), damit sie "Neu berechnen" überleben.
- **Warm/kalt:** Der Reiter auf der Mietvertragsseite zeigt die gespeicherte Position aufbereitet (keine eigene Berechnung) und trennt warm = BetrKV-Nr. 4–6 oder Name mit "Heiz…"/"Warmwasser" (`istWarmeKostenart`, `src/lib/kostenart-warm.ts`), sonst kalt.

**Gesamtflächen des Verwalters** (`NebenkostenQmAbweichung`, je Abrechnung und Kostenkreis; Abschnitt „Verwalter: abweichende Gesamtfläche“) mit Schalter `Nebenkostenabrechnung.verwalterFlaechen`:
- aus = nur Vergleichsrechnung „wie Verwalter“ live auf der Detailseite;
- an = die Abrechnung rechnet selbst mit diesen Flächen (kein Restcent-Ausgleich), jede Änderung berechnet die berechneten Positionen sofort neu, die Vergleichsspalte zeigt umgekehrt „mit korrekten Flächen“.
- Entscheidung: Jahre bis 2025 bleiben mit den (wahrscheinlich falschen) Flächen des Verwalters, ab 2026 gilt unsere Fläche — analog zu `WohnflaecheKorrektur`. 2021–2024 sind manuell geführt, dort greift das nicht.

**Restsaldo mit 1 Cent Toleranz:** Ein Rest bis 1 Cent nach Auszahlung/Verrechnung gilt als erledigt (`saldoMitToleranz`, `src/lib/nk-saldo.ts`). Wer den offenen NK-Saldo an einer neuen Stelle berechnet (Saldo − Begleichung), muss dieselbe Funktion verwenden.

## Manuelle und berechnete Positionen

- **Manuell** (`details = null`): von Hand angelegt, über „Position bearbeiten“/„Manuell überschreiben“ geändert, oder Platzhalter. **Berechnet**: `details` gesetzt.
- „Neu berechnen“ und das Umstellen auf „manuell“ rühren manuelle nie an; berechnete werden ersetzt bzw. gelöscht. Für einen Mietvertrag mit manueller Position entsteht keine berechnete (Unique je Abrechnung/Einheit/Mietvertrag).
- Jede Abrechnung hat einen Modus (`Nebenkostenabrechnung.manuell`, je Jahr genau eine Abrechnung): manuell = nur manuelle Positionen, „Neu berechnen“ gesperrt; „Auf berechnet umstellen“ legt berechnete an (wo keine manuelle existiert), „Auf manuell umstellen“ löscht die berechneten.
- In einer berechneten Abrechnung zeigt eine manuelle Position zwei Zeilen „manuell“ und „berechnet“ (live aus der Engine, nicht gespeichert).
- Stolperfalle: Eine Position wird nur durch `details = null` manuell — wer Werte direkt in der DB ändert, muss `details` auf NULL setzen, sonst wird sie ersetzt.

**Platzhalter-Positionen:** Fehlt für eine Verrechnung (Mieterkonto, Kaution) oder einen Nebenkostenausgleich (manuell, Import, Umbuchen, Aufteilen) die Position in der bestehenden Abrechnung des Jahres, legt `stelleNkPositionSicher` (`src/lib/nk-position-sicherstellen.ts`) eine Platzhalter-Position an (Beträge 0, Prüfkommentar „Automatisch angelegt …“; die Begleichung erscheint als offen). Nach "Neu berechnen"/Anlegen einer Abrechnung wird das für alle Verträge mit Begleichung des Jahres nachgeholt (`stelleNkPositionenFuerJahrSicher`). Zweck: Fehlzuordnungen fallen auf (z.B. Auszahlung einer Wohnung auf dem Garagenvertrag). Gibt es die Abrechnung des Jahres nicht, passiert nichts; rückwirkend wird nichts angelegt.

## Gegenrechnung der unbezahlten NK-Vorauszahlung

**Problem:** Die berechnete Abrechnung vergleicht die Kosten mit der *gezahlten* Vorauszahlung, im Mietsaldo steht aber das NK-*Soll*. Die unbezahlte Vorauszahlung stünde also doppelt da — als Rückstand und in der Nachzahlung.

**Lösung** (`unbezahlteNkVorauszahlung`, `src/lib/nk-saldo.ts`): Nach dem Versand der Abrechnung bekommt der Mieter die unbezahlte NK-Vorauszahlung (NK-Soll des Zeitraums − angesetzte Vorauszahlung) gutgeschrieben. Beispiel: Kosten 2.790,95 €, NK-Soll 3.360 €, gezahlt 2.520 € → Nachzahlung 270,95 €, Gutschrift 840 €.

- Gilt für berechnete Positionen ab Buchhaltungsbeginn (Stichtag des Vertrags). **Manuelle Positionen** nur, wenn die Abrechnung versendet und die eingetragene Vorauszahlung > 0 ist (`hatGegenrechnung`) — wer eine Position von Hand auf den Betrag des Vorverwalters setzt, hätte sonst die unbezahlte Vorauszahlung doppelt im Konto. Ausgenommen bleiben Platzhalter (Vorauszahlung 0) und manuelle Positionen unversendeter Abrechnungen (Verwalter-Beträge 2021–2024); wer eine solche später als versendet markiert, prüft vorher, ob die Vorauszahlung der tatsächlich gezahlten entspricht.
- **Die Gegenrechnung gehört zum Mietsaldo**, die Abrechnung (Nachzahlung/Guthaben) steht getrennt: Nach dem Versand ist die nicht gezahlte NK-Vorauszahlung nicht mehr geschuldet. Verworfen: Gutschrift in „NK offen“ einrechnen (widersprach der Nachzahlung auf der Abrechnung).
- Bewusst **keine gespeicherte Buchung** (abgeleiteter Wert, ändert sich mit „Neu berechnen“/Zahlungen; Buchungen sind unveränderlich). Der Verwalter bucht dasselbe als negative „Forderung Vorausz.“.
- Stolperfalle: Wer das Saldo (Soll − Zahlungen) an einer neuen Stelle berechnet, muss `gegenrechnungVorJahr` addieren, sonst weicht es von Offene Posten/Mieterkonto ab.
- Fehlt ein unbezahlter Monat zu Unrecht in der Gutschrift (z.B. Verwalter fordert weniger Monate), erst Soll/Mietbeginn klären. Vorschau: `scripts-tmp/gegenrechnung-vorschau.ts` (nur lesend).

## Versand der Abrechnung

`Nebenkostenabrechnung.versendetAm`: Auf der Detailseite „Als versendet markieren“ (Datum änderbar, „Versand zurücknehmen“; unabhängig vom Status Entwurf/Final, der nichts bewirkt). Als Datum gilt der tatsächliche Versand bzw. Zugang beim Mieter (nicht `erstelltAm`).

**Wirkung des Versanddatums (überall einheitlich):**
- Die Gegenrechnung zählt erst **ab diesem Datum** (Stichtag ≥ Datum; `gegenrechnungenJeJahr`/`gegenrechnungBis`, Sammelabfrage `ladeNkGegenrechnungen` in `src/lib/nk-gegenrechnung.ts`). Vorher schuldet der Mieter die Vorauszahlung tatsächlich noch — ein Rückstand von −640 € wird nicht rückwirkend zu −440 €.
- **Berechnete Positionen einer nicht versendeten Abrechnung zählen gar nicht** (weder Gutschrift noch Nachzahlung/Guthaben — sonst stünde die Nachzahlung ohne Gegenrechnung im Saldo). Manuelle Positionen (2021–2024) zählen nach der Quartalsregel der Jahresübersicht. Stolperfalle: Fehlt das Versanddatum, zeigen Offene Posten, Dashboard und Jahresübersicht die Rückstände ohne Gutschrift.
- **Mieterkonto:** Zeile „Gutschrift unbezahlte NK-Vorauszahlung Y“ am Versanddatum (Teil des laufenden Saldos, im Folgejahr im Übertrag), darunter „Nebenkostenabrechnung Y offen“ (nur die Abrechnung, z.B. −270,95 €) und „Saldo inkl. offener Nebenkostenabrechnung“.
- **Jahres-/Quartalsübersicht:** Spalte „Gutschrift unbezahlte NK-Vorauszahlung“ im Quartal des Versands (in Saldo neu enthalten, danach in Saldo alt); Spalte „Nebenkostenabrechnung offen (Vorjahr)“ ab Q3 ohne Gegenrechnung (siehe `docs/berichte-steuer.md`). Im Jahresbericht enthält `nebenkostenabrechnungOffen` nur die Abrechnung, die Gutschrift steht in `nebenkostenGegenrechnung`.
- **Offene Posten** (Spalte „davon NK-Gegenrechnung“), Dashboard-Rückstand und Mietvertragsseite rechnen sie ein; die Abrechnung selbst steht dort nicht im Saldo, nur im Folgejahr unter „offen“.

Vor dem Versand fehlende Belege: siehe `docs/dokumente.md` → „Belegprüfung“ (Bestätigungsfrage, kein Sperren). Das Schreiben an die Mieter: `docs/schreiben-mieter.md`.

## Verrechnungen: Überweisung ≠ Abrechnung

**Grundregel:** Der `NEBENKOSTENAUSGLEICH` bleibt der Bankbetrag (1:1 zum Kontoauszug) und wird **nicht aufgeteilt**. Die Differenz zur Abrechnung ist **eine** Verrechnung: Zahlungen → Neu → "Verrechnung Nebenkostenabrechnung" = `MAHNGEBUEHR` mit `bezugTyp = NK_VERRECHNUNG_BEZUG`, `jahr` = Abrechnungsjahr, Datum der Überweisung. Vorzeichen = Wirkung aufs Mietkonto: negativ = BK-Guthaben deckt Rückstand (z.B. −6 €), positiv = Mietkonto-Guthaben mit ausgezahlt (z.B. +3 €). Aufteilen einer Nebenkostenausgleich-Buchung nur bei Überweisungen über mehrere Mietverträge/Jahre.

- **Mit der Kaution verrechnet** (z.B. Kaution 100 €, Nachzahlung 67,34 €, überwiesen −32,66 €): `KAUTION_AUSZAHLUNG` bleibt der Bankbetrag, die Verrechnung ist ein `KAUTION_EINBEHALT` mit Abrechnungsjahr (−67,34 €, "Verrechnung mit Nebenkostenabrechnung") — kein Aufteilen. Aufteilen einer Kautionsbuchung nur bei Sammelüberweisungen mit zugleich ausgezahltem BK-Guthaben (z.B. −694,90 € = Kaution −273,10 € + BK-Ausgleich −421,80 €).
- **Gesamtforderung in einer Überweisung** (Mietrückstand + NK-Nachzahlung(en) + ggf. Folgemiete): bleibt **eine `MIETZAHLUNG`** über den Bankbetrag; jede NK-Nachzahlung kommt je Abrechnungsjahr als Verrechnung dazu. **Nicht** aufteilen und **nicht** als `NEBENKOSTENAUSGLEICH` buchen (der Hauptteil ist Mietrückstand). Probe: Mietzahlung − Soll − Verrechnungen = Saldo des Vorverwalters (Reste = von ihm auf 9600 abgegrenzte Folgemiete).
- **Zu viel ausgezahltes BK-Guthaben** (Fehler des Vorverwalters, z.B. Sammelguthaben „BK-Abr 2021-2023“ 17,24 € zu hoch): Nebenkostenausgleich bleibt der Bankbetrag; der Mehrbetrag wird je Abrechnungsjahr als positive Verrechnung gebucht (Überzahlung im Jahr mit Guthaben, offene Nachzahlung im anderen Jahr). Das Mieterkonto zeigt dann den Rückstand wie beim Verwalter, die Jahre sind 0 € offen. Bei der nächsten Auszahlung: Bankbetrag um den Rückstand kürzen und eine negative Verrechnung buchen. Der Verwalter bucht Guthaben als negative "Forderung Abrechn.", Auszahlungen als negative "Einnahme Abrechn.".
- **Rückzahlung einer Auszahlung** (z.B. Kreis Ostholstein erstattet ein an ihn überwiesenes Guthaben) ist ebenfalls ein `NEBENKOSTENAUSGLEICH` (positiv, Jahr der Auszahlung), **keine** `MIETZAHLUNG` — sonst steht eine gleich hohe Überzahlung auf dem Mieterkonto. Der Import schlägt "Rückzahlung Guthaben" bisher als Mietzahlung vor, von Hand umbuchen.

## Betriebskosten der Garagen

Nur in einem Teil der Garagenverträge ist die Umlage anteiliger Betriebskosten klar vereinbart (Garagen 1, 2, 5, 7, 8: § 3 Nr. 3, bei Garage 7 Nr. 2; Grundsteuer, Straßenreinigung, Beleuchtung, Versicherung usw., Schlüssel nach Flächen oder „angemessen“), ohne Vorauszahlung/Pauschale. Die Verträge der Garagen 3, 6 und 9 kennen keine Umlage (Pauschalmiete), Garage 4 nur die Umlage von Erhöhungen nach Vertragsschluss — dort wird nichts abgerechnet (`docs/mietvertraege-mieter.md` → „Betriebskosten im Vertrag“). Der frühere Verwalter (2011–2026) hat nie umgelegt; die drei Kostenarten „Straßenreinigung & Grundsteuer Garagen“, „Strom Garagen“ und „Gebäudevers. Garagen“ sind nicht umlagefähig geführt (siehe `docs/kosten-dienstleister.md`).

**Entscheidung 09.11.2026: Verzicht auf die Umlage 2025.** Es wird nichts abgerechnet (zuvor war eine Abrechnung 2025 als Schreiben geplant; verworfen, siehe `docs/schreiben-mieter.md` → „Schreiben an die Garagenmieter“). Die Kostenarten bleiben in der App nicht umlagefähig. Die Zahlen unten bleiben als Rechengrundlage, falls später doch abgerechnet oder pauschaliert wird (Skript-Schalter `UMLAGE_ABRECHNEN`). Ein Neuvertrag mit Betriebskostenpauschale ist offen.

- **Kosten 2025: 704,76 €** = 460,83 € Stadt + 161,99 € Strom + 81,94 € Versicherung. Die Stadt-Rate ist laut Abgaben-Jahresbescheid Grundsteuer B 421,89 € + Straßenreinigung 38,94 € (in der App eine Buchung je Quartal, getrennt nur im Schreiben).
- **Strom nach Verbrauchsjahr, nicht nach Zahlungsdatum:** Die Buchungen 2025 (134,48 €) enthalten die Abrechnung 2024 und nicht die 2025 (abgebucht erst 2026); angesetzt werden die Gesamtkosten laut Jahresrechnung 2025 (brutto 161,99 €, die Vermieterin hat keinen Vorsteuerabzug). Die Rechnung besteht überwiegend aus festen Kosten (Grundpreis, Messstelle); das Schreiben nennt sie als eine Zeile.
- **Schlüssel: gleich durch 10 Garagen** (70,47 € je Garage als Summe der gerundeten Zeilen; die selbst genutzte Garage und Leerstand trägt die Vermieterin; Flächen sind nicht erfasst), bei unterjährigem Beginn anteilig.
- Die App-Zahlen für 2023/2024 sind unvollständig (Grundsteuer bzw. Versicherung fehlen), für ältere Jahre liegen keine Kosten vor.

**Rechtsfrage Vorjahre (offen):** Der Steuerberater sieht die Jahresfrist des § 556 Abs. 3 BGB und die Vorjahre als verloren. Dagegen spricht, dass die Vorschrift für Wohnraum gilt, der Garagenvertrag das Wohnraummietrecht in § 11 ausschließt und § 578 BGB nur auf einzelne Vorschriften verweist — dann gälte nur Verjährung/Verwirkung. Vor einer schriftlichen Position von einem Anwalt klären lassen. Ein Schadensersatzanspruch gegen den früheren Verwalter ist nur theoretisch geprüft (Obergrenze 2011–2024 grob 6.000–8.500 €, realistisch deutlich weniger wegen Verjährung und Mitverschulden).
