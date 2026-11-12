# Kontoprognose

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

Seite `/kontoprognose` (Menü Finanzen): schreibt den simulierten Kontostand (`docs/berichte-steuer.md`, Kontostand-Seite) Monat für Monat fort. Reine Rechnung `src/lib/kontoprognose.ts`, Daten `src/lib/kontoprognose-laden.ts`; die Seite schreibt nichts ins Journal.

## Bedienung

- **Erst auf Knopfdruck:** Die Seite zeigt beim Öffnen nur das Formular und rechnet nach „Prognose berechnen“ (Vercel-CPU, `docs/deployment-vercel.md`).
- Zeitraum 6/12/18/24 Monate ab dem laufenden Monat; der laufende Monat zählt nur, was noch aussteht (Gebuchtes steckt im Startstand).
- **Überschreibbar:** Weiterleitung je Monat (leer = automatisch) und Nebenkostenausgleich (wie im Vorjahr / nicht berücksichtigen). Die Zahlungsquote der Miete ist immer automatisch (verworfen: Eingabefeld, wurde nicht gebraucht).
- **Kosten anpassen:** drei Felder für Verwaltungskosten, Reparaturen und Sonstige Kosten (`ANPASSBARE_KOSTENARTEN`, `src/lib/kontoprognose.ts`) — die Kostenarten, die beim Vorverwalter besonders hoch waren und nach der Übernahme der Verwaltung sinken können. Eingabe in Prozent der bisherigen Höhe (100 = unverändert/leer, 50 = halbiert, 0 = entfällt); der Faktor skaliert den Ansatz der Kostenart. Die Annahmen nennen die Anpassung mit der Ersparnis je Monat. Verworfen: Auswahlliste aller Kostenarten (zu mühsam, es geht nur um diese drei).
- **Vorschlag aus den Monaten seit der Übernahme:** Link unter den drei Feldern (`vorschlag=1`, `ladeKostenVorschlag`, Rechnung `schlageKostenAnteilVor`). Monatsmittel der **vollen** Monate seit `VERWALTUNG_UEBERNOMMEN` (1.10.2026; der laufende Monat zählt nicht) gegen das Monatsmittel der 12 Monate davor ergibt den Anteil, auf ganze Prozent gerundet; eine Gutschrift im Zeitraum ergibt 0 %. Der Vorschlag füllt nur Felder, die in der Adresse fehlen. Bei weniger als 3 vollen Monaten warnt die Seite (Reparaturen schwanken stark, Nachläufer aus der Zeit des Vorverwalters). Der Übernahmemonat steht fest im Code, nicht in der Datenbank.
- **Warnschwelle:** fest 0 € — Monate mit negativem Endstand sind rot, die Karte „Monate unter 0 €“ zählt sie. Verworfen: einstellbarer Mindestbestand (wurde nicht gebraucht).

## Annahmen

- **Mieteingang** = Soll der Verträge mit Status aktiv/geplant (`sollAufschluesselung`, mit eingetragenen Mieterhöhungen, Vertragsenden, Umsatzsteuer der Garagen) × Zahlungsquote. Quote = Mietzahlungen der letzten 6 Monate ÷ Soll derselben Monate (nach Buchungsdatum, höchstens 100 %). Leerstehende Wohnungen werden nicht neu vermietet.
- **Laufende Kosten** je Kostenart aus den letzten 12 Monaten (nach Abbuchungsdatum, nur zahlungswirksame Kostenpositionen): in mindestens 8 Monaten gebucht = regelmäßig (Monatsmittel), sonst unregelmäßig (Betrag im jeweiligen Vorjahresmonat). Kostenarten mit Einordnung „Schuldzinsen“ fehlen hier, die Zinsen stehen in den Darlehensraten.
- **Darlehensraten** laut Tilgungsplan der aktiven Darlehen (`docs/darlehen.md`), ab dem Wechsel aufs Mietkonto (`MIETKONTO_AB`), außer für den Monat ist schon eine Rate gebucht.
- **Weiterleitung** = Median der monatlichen Nettoabflüsse der letzten 3 Monate (glättet Ausreißer).
- **Nebenkostenausgleich** = Summe je Kalendermonat der letzten 12 Monate, im gleichen Monat wieder; ein großes Guthaben des Vorjahres steht damit als Auszahlung in der Prognose.
- **Nicht enthalten:** Kautionen (eigenes Konto), neue Mieterhöhungen, Neuvermietung, geplante Großreparaturen, Sondertilgungen, Steuern.

## Stolperfalle

Ein `NOT: { kostenart: { anlageVZeile: … } }` in Prisma schließt auch Kostenarten ohne Einordnung (NULL) aus — der Filter auf „Schuldzinsen“ geschieht deshalb im Code.
