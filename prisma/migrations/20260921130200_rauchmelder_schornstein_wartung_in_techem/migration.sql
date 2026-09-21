-- Rauchmelderwartung, Schornsteinfeger und Wartungsarbeiten Heizung sind in der Techem-
-- Gesamtabrechnung pro Mieter enthalten: keine eigene Verteilung und keine eigene Eingabe. Sie
-- zählen als umlagefähig (über Techem umgelegt), werden aber in der Abrechnung nicht gesondert
-- berechnet. Bewusst ohne Bedingung auf den bisherigen Schlüssel (live war Rauchmelderwartung nach
-- Einheiten verteilt, die beiden anderen nicht umlagefähig); idempotent.
UPDATE "kostenarten"
SET "umlagefaehig" = true,
    "standardVerteilerschluessel" = 'IN_ABRECHNUNG_ENTHALTEN'
WHERE "name" IN (
  'Rauchmelderwartung',
  'Schornsteinfeger (über Techem verrechnet)',
  'Wartungsarbeiten Heizung (über Techem verrechnet)'
);
