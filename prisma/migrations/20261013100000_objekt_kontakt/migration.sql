-- Kontaktdaten des Objekts (Mietertelefon, E-Mail Verwaltung, E-Mail Mieter).
-- Nur neue, nullable Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "objekte" ADD COLUMN "telefonMieter" TEXT;
ALTER TABLE "objekte" ADD COLUMN "emailVerwaltung" TEXT;
ALTER TABLE "objekte" ADD COLUMN "emailMieter" TEXT;
