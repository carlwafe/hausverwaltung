# Zahlungen, Kautionen, Zahlungsweg, Tilgungsreihenfolge

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Kommentar zur Buchung

Auf der Detailseite einer Zahlung (`/zahlungen/[id]`, alle drei Ansichten: Mietzahlung, Gebühren-Zahlung, Gebühren-Forderung/NK-Verrechnung) lässt sich ein interner Freitext-Kommentar (max. 1.000 Zeichen) erfassen, ändern und durch Leeren entfernen; Gäste sehen ihn nur.

- Da Buchungen unveränderlich sind, liegt er in der eigenen Tabelle `buchung_kommentare` (`BuchungKommentar`, höchstens einer je Buchung, mit `geaendertVon`/`aktualisiertAm`). Aktion `speichereBuchungKommentar` (`buchungen/actions.ts`), Komponente `src/components/buchung-kommentar.tsx` (hält ihren Zustand selbst, kein `revalidatePath`).
- Bei Storno + Neuanlage kopiert `uebernehmeBuchungKommentar` ihn auf die neue(n) Buchung(en) (beim Aufteilen nur auf die Zahlungsteile); am stornierten Original bleibt er als Historie. Siehe Checkliste in `CLAUDE.md` → „Storno statt Ändern“.
- Angezeigt wird er bisher nur auf der Zahlungs-Detailseite (nicht in Listen, Kosten- oder Kautionsseiten).

## Kautionen

`src/lib/kautionskonto.ts`, `kautionen/`.

**Grundregeln**
- Kautionsbetrag = ursprünglich eingezahlte Kaution, nicht der Auflösungsbetrag. Die Zinsen berechnet `baueKautionskonto` aus der Auflösung (Auflösung + Rückbuchungen − Angelegtes), kein Zinssatz nötig (z.B. 870 € eingezahlt, 872,34 € aufgelöst → 2,34 € Zinsen).
- Häkchen "Einzahlung vor Buchhaltungsbeginn" (`einzahlungUnbekannt`) nur, wenn gar keine Einzahlung im Journal steht. Liegt nur ein Teil vor Buchhaltungsbeginn, diesen Teil als Einzahlung buchen.
- Rückflüsse behalten das Bankvorzeichen statt eigener Kategorie: positive `KAUTION_ANLAGE` = Rückbuchung vom Kautionskonto (doppelt angelegt, Kontowechsel), positive `KAUTION_AUSZAHLUNG` = zurückgekommene Auszahlung.
- Überweisung "1. Miete und Kaution" → Zahlung aufteilen mit Teil "Kaution".
- Fehlt zu einer Kaution der Anlage-Abgang im Kontoauszug (und beim Verwalter die Anlage-Zeile auf 3500), war sie vermutlich nie angelegt: keine Zinsen, keine `KAUTION_AUFLOESUNG` buchen, Anlageform „Bar“.

**Einbehalte**
- *Vorläufig* (Rechnung folgt): liegt sie vor → Einbehalt löschen und „Verrechnung mit Rechnung“ anlegen (siehe unten).
- *Pauschal* (endgültig ohne Rechnung, z.B. Abnutzung, Sperrmüll, 8 € Briefkastenschlüssel): Einnahme, EÜR-relevant. **Nicht** als Verrechnung mit Rechnung buchen — sonst erscheint der Betrag weder unter Kosten noch in der Jahresübersicht.
- Verrechnung mit NK-Abrechnung (Nachzahlung) oder mit dem Mieterkonto (Rückstand/Gebühren). Mietsaldo/Sonderforderungen immer über `SONDERBUCHUNGEN_FILTER` + `sonderWirkung` (`sonderforderungen.ts`) berechnen, sonst fehlt die Verrechnung Kaution ↔ Mieterkonto (`KAUTION_EINBEHALT` mit `bezugTyp = MIETERKONTO_VERRECHNUNG_BEZUG` zählt dort als Zahlung).
- Übersicht: Offen = einbehalten − pauschal → erledigt / Rest offen / überzahlt.

**Verrechnung mit Rechnung** (technisch `KAUTION_VIRTUELLE_AUSZAHLUNG`; Kautionen → Neu, mit Verknüpfung zur Kostenposition). Trägt der Mieter eine Rechnung über die Kaution (z.B. Schlossaustausch 71,40 €): Die Rechnung bleibt als `KOSTENPOSITION` stehen, die Kautionsbuchung legt automatisch eine Gegen-Kostenposition "Verrechnet mit Kaution" (−71,40 €) an — Kosten netto 0, die Kaution sinkt, die Verrechnung ist nicht EÜR-relevant.
- Keine Auszahlung: Es gibt keinen Bankfluss, deshalb zählt sie in der Tabelle unter „Verrechnet“ (blaues „⇄“) und in `baueKautionskonto` als Einbehalt „mit bezahlter Rechnung verrechnet“ (Rechnungstext über `rechnungstext`). Übersteigen die Verrechnungen die Kaution, meldet die Abrechnung „vom Mieter nachzufordern“.
- `storniereBuchung` storniert die aktive Gegen-Kostenposition (`bezugTyp` „Buchung“, `bezugId` = die Auszahlung) automatisch mit. Altlasten-Prüfung (aktive Buchungen mit `bezugTyp = 'Buchung'`, deren Ziel storniert ist, plus Einbehalte gegen `KautionEinbehalt`): Leseskript `scripts-tmp/orphan-check.ts`.

**Abgleich mit dem Verwalter (Konto 3500):** Eine Erstzahlung „1. Miete und Kaution“ teilen wir auf; der Verwalter kann den vollen Betrag als Kaution führen und auszahlen — dann Rückfrage. „Einnahmen“ in seiner Mieterzeile ohne Bankumsatz sind Kautionsverrechnungen.

## Zahlungsweg (Lastschrift, Überweisung, Amt)

`Mietvertrag.zahlungsweg` wird aus dem Kontoauszug abgeleitet:
- **Lastschrift:** `Buchungstext` der Mietzahlung enthält `LASTSCHRIFT` (`EINZELLASTSCHRIFTEINZUG`, `FOLGELASTSCHRIFT`, `EINMAL LASTSCHRIFT`).
- **Überweisung:** `GUTSCHR. UEBERWEISUNG`/`…DAUERAUFTR`/`ECHTZEIT-GUTSCHRIFT`.
- **`BEHOERDE`** („Amt zahlt“): Überweisung von „Bundesagentur …“/„Jobcenter“ oder „Kreis Ostholstein“ (ob der Kreis als Jobcenter oder Sozialamt zahlt, verrät der Name nicht — deshalb ein gemeinsamer Wert).

**Automatik** (`leiteZahlungswegAb`, `src/lib/zahlungsweg-ableiten.ts`): die jüngsten 4 Mietzahlungen mit Bankzeile (positiv; Rücklastschriften zählen nicht), mindestens 3, alle von einer Art — schon eine abweichende Zahlung macht das Ergebnis offen. Der Import (`commitBuchungen` → `aktualisiereZahlungswege`; Fehler stören den Import nicht) trägt ihn nur ein, wenn **kein** Zahlungsweg erfasst ist. Ein erfasster Wert wird **nie überschrieben**.

**Warnung „Zahlungsweg prüfen“:** Sind die jüngsten **2** Zahlungen beide von einer anderen Art als der erfasste Weg (`leiteAbweichungAb`; abwechselnde Zahlungen wie Amt + Eigenanteil lösen nichts aus), merkt sich die App den Vorschlag in `Mietvertrag.zahlungswegHinweis`; beendete Verträge bekommen keine.
- Gerechnet **nur beim Import** (Vercel-CPU: `rohdaten` ist die schwere Spalte). Anzeige: gelbes Banner auf „Mietverträge“ (mit „Übernehmen“ und „Hinweis verwerfen“), „⚠ Zahlungsweg“ in der Mieter-Spalte, Zeile in den Vertragsdaten.
- „Hinweis verwerfen“ merkt ihn in `zahlungswegHinweisVerworfen` (derselbe Vorschlag kommt nicht wieder, ein anderer schon; passen die Zahlungen wieder, wird er zurückgesetzt). Wer den Zahlungsweg im Formular ändert, erledigt die Warnung ebenfalls.
- „Mietvertrag bearbeiten“ zeigt zusätzlich die strenge Ableitung als Vorschlag. Leseskripte: `scripts-tmp/zahlungsweg-warnungen.ts`, `scripts-tmp/zahlungsweg-vergleich.ts`.

**Sonstiges**
- Beim Weg `BEHOERDE` bittet das Anpassungsschreiben, es ans Amt weiterzuleiten, und lädt keine Mandatsdaten.
- Die Bank bucht Lastschriften **einzeln pro Mieter** (keine Sammelgutschrift, kein Zwischenkonto; EÜR nach Zufluss). Mandatsreferenz, Gläubiger-ID und Zahler-IBAN stehen in `Buchung.rohdaten`, siehe `docs/sepa-lastschrift.md`.
- Ändert sich der Betrag, gilt das Anpassungsschreiben als Vorabankündigung; der neue Betrag muss ab "Gültig ab" auch im Lastschrifteinzug stehen.
- Eine Rücklastschrift ist eine negative `MIETZAHLUNG` (Buchungstext `LS RUECKBELASTUNG`) inkl. Bankgebühr (Buchung siehe „Rücklastschrift-Gebühren“ unten). Widerspricht ein Mieter jeden Monat und zahlt danach per Dauerauftrag, gilt er als Überweiser.

## Tilgungsreihenfolge bei Teilzahlungen und Rückständen

**Gesetz:** § 366 Abs. 1 BGB — der Mieter bestimmt **bei der Zahlung**, welche Schuld getilgt wird (Verwendungszweck „Rückstand“, „Rate Rückstand“, „Miete Januar“); nachträglich ändert das niemand. Ohne Bestimmung § 366 Abs. 2: fällige vor nicht fälligen → geringere Sicherheit (Bürgschaft, Titel u.ä. für genau diese Forderung; die Kaution sichert alle Monate gleich) → lästigere → ältere → sonst **verhältnismäßig**; § 367: erst Kosten, dann Zinsen, dann Hauptforderung.

**Mietvertrag** (Muster „Mietvertrag Entwurf blanko“ in iCloud „Waller-HH/5. Immobilien/Eutin“; die unterschriebenen Verträge des Vorverwalters ab 2020 sind nicht gegengelesen): § 5 Nr. 4 wiederholt das — Kosten, Zinsen, Mietsicherheit, zuletzt Hauptschuld, ältere Schuld zuerst (Mietsicherheit vor Hauptschuld ist als Formularklausel angreifbar). § 5 Nr. 1/2 fasst Miete, Betriebs- und Heizkosten zu einem **Gesamtbetrag** zusammen; zu Kaltmiete gegen NK-Vorauszahlung sagen weder Gesetz noch Vertrag etwas.

**Regel in der App**
- Ohne Bestimmung: ältester Monat zuerst. Eine Zahlung mit „Rate Rückstand“ nennt keinen Monat → ältester.
- Innerhalb eines Monats bei Teilzahlung (Zahlung < Kaltmiete + NK-Soll):
  - **Mietperioden bis 2024: NK zuerst**, Rest Kaltmiete (praktische Entscheidung; diese Abrechnungen sind manuell geführt und die Aufstellungen liegen dem Steuerberater vor).
  - **Ab Mietperiode 2025: anteilig** — NK-Anteil = Zahlung × NK-Soll ÷ (Kaltmiete + NK-Soll), kaufmännisch auf volle Euro gerundet, höchstens das NK-Soll; Rest Kaltmiete. Grund: nach dem Wortlaut von § 366 Abs. 2 (gleich alt, gleich gesichert, Gesamtbetrag) die näherliegende Lesart; volle Euro für glatte Beträge in Schreiben und Abrechnung. Verworfen: 50:50 (nicht verhältnismäßig).
  - **Beispiel** (gilt für alle Dateien): 380 € auf 340 € Kalt + 280 € NK → bis 2024 280 € NK + 100 € Kalt, ab 2025 172 € NK + 208 € Kalt. Wer mindestens das Soll zahlt, bekommt in beiden Fällen den vollen NK-Betrag.
- Umgesetzt in `nkAnteilEinerZahlung` (`src/lib/nk-anteil.ts`, `ANTEILIG_AB_JAHR = 2025`), genutzt von `berechneNebenkostenabrechnung` und `teileMietzahlungen` (Aufstellung für die Steuererklärung). Ein mit Guthaben verrechneter Rückstand (`rueckstandVerrechnet`) zählt weiter zuerst als nachgezahlte NK.
- Nicht abgebildet: eine abweichende Tilgungsbestimmung des Mieters zwischen Kalt und NK — im Einzelfall die Position von Hand korrigieren.
- **Mieterkonto:** Bei Teilzahlungen (ab 2025) steht in der Bemerkung „Teilzahlung/Restzahlung anteilig: x € NK + y € Kaltmiete“ (`teilzahlungsHinweise`, `src/lib/mieterkonto.ts`). Bewusst **keine** Spalten „Ist Kaltmiete/Ist NK“: Der Mieter zahlt einen Gesamtbetrag, und eine Differenz je Kategorie täuschte einen Kaltmiete-Rückstand vor.

**Stolperfalle Mietperiode:** Die Engine rechnet strikt monatlich nach Mietperiode. Trägt eine nachgezahlte Rückstandszahlung die Periode des Zahlungsmonats, zählt sie nicht in der Vorauszahlung des alten Abrechnungsjahres, und das Mieterkonto stimmt nur im Gesamtsaldo. Solche Zahlungen per Storno + Neuanlage auf die Perioden der getilgten Monate legen (ältester zuerst). Der Gesamtbetrag offen bleibt gleich, es verschiebt sich aber die Aufteilung zwischen Mietrückstand und NK-Nachzahlung — das zählt für Ratenvereinbarung, Mahnung und Kündigung (Beispiel mit Zahlen: `docs/schreiben-mieter.md` → „Mahnung, Korrekturschreiben und Kündigung“).

**Prüfung auf falsch zugeordnete Rückstandszahlungen** (Leseskripte `scripts-tmp/rs-zahlungen-pruefung.ts` für alle Verträge, `rs-detail.ts` für eine Monatstabelle): Bis 04.11.2026 setzte der Import auch bei „Nachzahlung Mai“ den Zahlungsmonat — es entstanden verschobene Ketten, in denen jeder Monat genau eine Zahlung hat. Eine reine Soll/Ist-Prüfung findet sie nicht; zuverlässig ist der Abgleich des im Text genannten Monats mit `periodeJahr/periodeMonat`. Ob wirklich eine ältere Schuld offen ist, nur mit dem **vollständigen** Saldo beurteilen (Saldovortrag + Ist − Soll ab Stichtag + `sonderWirkung`); bei Saldo 0 ist eine falsche Periode nur Optik. Zahlungen vor dem Stichtag des Vertrags wirken nicht aufs Saldo.

## Mietperiode der Zahlung

**Vorschlag im Import** (`src/lib/import/mietperiode.ts`, in `previewImport`, bei Vertragswechsel in der Tabelle neu):
1. Rücklastschrift: Buchungsmonat.
2. Nennt der Verwendungszweck einen Monat („Miete Januar“, „Monatsmiete März 2024“, „11.25 MIETE+BK“, Lastschrift-Referenz „2000.903-11.25“, Bereich „04-09/2025“), gilt er (Tilgungsbestimmung); bei mehreren der älteste mit Hinweis „ggf. aufteilen“. Nicht übernommen: Monate vor Stichtag/Vertragsbeginn und frühere Monate, die laut Journal schon bezahlt sind (≥ 95 % der Warmmiete; Tippfehler im Jahr, alter Dauerauftragstext).
3. Ohne Monat im Text: Eingang ab dem 25. = Folgemonat; bei Mietern, die am Monatsende vorauszahlen (mind. 2 solche Zahlungen, mehr als im selben Monat), schon ab dem 20. Ausnahme: laufender Monat noch unbezahlt und der Mieter zahlt sonst nicht voraus → laufender Monat (verspätete Miete).
4. Sonst Buchungsmonat; nie vor Vertragsbeginn oder nach Vertragsende.

Frühere Zeilen derselben Datei zählen mit (Verarbeitung nach Datum). Abweichender Mietmonat ist gelb mit Begründung markiert, Filter „Mietmonat ≠ Eingangsmonat“. Rückwärtstest gegen alle Mietzahlungen mit Bankzeile (`scripts-tmp/vz-folgemonat-rueckwaerts.ts`): Buchungsmonat 92,3 % richtig, Regel 99,2 %; die Reste sind Sonderfälle (Raten, Gesamtforderung, Storno-Texte, gemischte Zahler) und früher falsch gebuchte Rückstandszahlungen.

**Jobcenter:** Die Bundesagentur (Absender „Bundesagentur fuer Arbeit-Service-Haus“) zahlt am **Monatsende für den Folgemonat** — auf den Buchungsmonat gesetzt, steht jede Zahlung einen Monat zu früh und der Rückstand im falschen Monat. Zahlt ein Dritter einen Teil mit (z.B. ein Angehöriger), gehören beide Teile zur selben Periode.

**Doppelzahlungen** (Mieter per Lastschrift und Jobcenter überweist zusätzlich, Rückerstattungen „Erstattung Überzahlung“ als negative `MIETZAHLUNG`): Jede Zahlung bekommt ihren eigenen Monat, die Rückerstattungen kommen auf die überzahlten Monate — netto je Monat Soll. Prüfen: Summe je Periode = Soll. Korrigiert wird per Storno + Neuanlage (Skript mit Vorabprüfung, Netto je Periode vorher/nachher vergleichen).

## Gebühren und Rücklastschriften

**Monat von Gebühren im Mieterkonto.** Gebühren-Forderungen (`MAHNGEBUEHR`, außer NK-Verrechnung) und Gebühren-Zahlungen (`SONDERZAHLUNG`) stehen im Mieterkonto im Monat ihres Datums, optional in einem anderen Monat: `periodeJahr/periodeMonat` als **Monat im Mieterkonto** (nur Anzeige, `sonderMonat` in `src/lib/mieterkonto.ts`).
- Beim Aufteilen übernimmt die Gebühr automatisch den Monat des ersten Mietteils (änderbar); bestehende Gebühren ändert man auf ihrer Detailseite unter „Im Mieterkonto unter“ (`aendereGebuehrMonat`: Storno + Neuanlage mit gleichem Bezug; „nach Datum“ setzt zurück).
- Saldo, offene Gebühren (`ladeSonderforderungSalden`), Jahresübersicht und EÜR rechnen weiter nach dem Datum; deshalb gilt der Monat nur im Jahr des Datums. Abfragen nach Mietperiode filtern auf `MIETZAHLUNG`.
- „Aufteilung rückgängig“ übernimmt den Monat der Mietteile, wenn alle denselben haben.

**Rücklastschrift-Gebühren buchen.** Eine Rücklastschrift mit Bankgebühr wird aufgeteilt (Zahlung → „Aufteilen…“):
- **Mietteil** negativ mit dem Mietmonat der geplatzten Zahlung (bei geplatzter Nachzahlung „Miete Januar“ also Januar).
- **Bankgebühr** als Teil „Kosten“, Kostenart „Nebenkosten des Geldverkehrs“, negativer Betrag, mit „dem Mieter berechnen“ (legt die Gebühren-Forderung an, sie übernimmt den Mietmonat).
- Die Bankgebühr **nie als negative Gebühren-Zahlung** buchen: In der Aufstellung stünde sie sonst als Minderung der „Sonstigen Einnahmen“ statt bei den Nebenkosten des Geldverkehrs.
- Zahlt der Mieter die Gebühr, ist das eine **Gebühren-Zahlung**, keine Mietzahlung (sonst steht sie im Mietsaldo und die Forderung bleibt offen). Platzt diese Zahlung wieder, ist ihr Anteil an der Rücklastschrift eine **negative Gebühren-Zahlung** — der einzige Fall dafür.
- Beispiel (Rücklastschriften mit je 5,22 € Bankgebühr): −75,22 € = −70,00 € Miete Januar + Kosten 5,22 € mit Forderung; −10,44 € (geplatzte Gebührenzahlung + neue Bankgebühr) = −5,22 € Gebühren-Zahlung + Kosten 5,22 € mit Forderung.
- **Stolperfalle:** Eine Gebühren-Zahlung hat keinen „Aufteilen“-Knopf — erst „Buchungsart ändern…“ auf Miete (Monat = Mietmonat), dann die Mietzahlung aufteilen.

Mahngebühren im Import und die zwei Buchungswege: `docs/kontoauszug-import.md` → „Mahngebühren“.
