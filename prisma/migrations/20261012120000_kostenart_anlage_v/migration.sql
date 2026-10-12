-- Zuordnung der Kostenarten zu den Zeilen der Anlage V (Überleitung in der Jahresübersicht).
-- Nur ein neuer Enum und eine neue, nullable Spalte — bestehende Daten bleiben unberührt;
-- NULL bedeutet „automatischer Vorschlag“.
CREATE TYPE "AnlageVZeile" AS ENUM ('ERHALTUNGSAUFWAND', 'BETRIEBSKOSTEN', 'VERWALTUNG', 'SONSTIGES', 'SONSTIGE_EINNAHMEN');
ALTER TABLE "kostenarten" ADD COLUMN "anlageVZeile" "AnlageVZeile";
