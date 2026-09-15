-- Beglichen-Status wird jetzt live aus NebenkostenausgleichZahlung abgeleitet statt direkt auf der
-- Position gepflegt (siehe ladeNebenkostenausgleichSummen in nebenkostenabrechnungen/actions.ts).
-- Vor dieser Migration wurde die einzige Position ohne passende NebenkostenausgleichZahlung
-- (Klaus-Dieter Hamer, 2024) per Skript nachgetragen.
ALTER TABLE "nebenkostenabrechnung_positionen" DROP COLUMN "beglichenAm";
ALTER TABLE "nebenkostenabrechnung_positionen" DROP COLUMN "beglichenBetrag";
