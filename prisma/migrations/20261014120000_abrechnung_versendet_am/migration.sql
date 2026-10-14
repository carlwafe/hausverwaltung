-- Datum, an dem die Nebenkostenabrechnung an die Mieter versendet wurde (leer = noch nicht versendet).
-- Neue nullable Spalte — bestehende Daten bleiben unberührt.
ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN "versendetAm" DATE;
