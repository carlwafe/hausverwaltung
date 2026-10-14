-- Darlehen, die über das Mietkonto laufen (Zinsen + Tilgung):
--  * Zinsen sind Werbungskosten (Schuldzinsen) und werden als Kostenposition einer Kostenart mit der
--    Einordnung SCHULDZINSEN gebucht (neuer Enum-Wert, bestehende Daten bleiben unberührt).
--  * Die Tilgung ist kein Aufwand, sondern verringert die Restschuld: eigene Buchungsart mit Geldfluss
--    (bewegt den Kontostand), aber nicht eur-relevant — wie die Mietweiterleitung.
ALTER TYPE "AnlageVZeile" ADD VALUE 'SCHULDZINSEN';

INSERT INTO "buchungsarten" ("id", "code", "bezeichnung", "kontokreis", "zahlungswirksam", "eurRelevant")
VALUES
  ('ba_darlehen_tilgung', 'DARLEHEN_TILGUNG', 'Darlehenstilgung (kein Aufwand, mindert die Restschuld)', 'OBJEKTKONTO', true, false)
ON CONFLICT ("code") DO NOTHING;
