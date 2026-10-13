-- SEPA-Gläubigerdaten des Objekts (Vorbelegung der Lastschriftmandate).
-- Nur neue, nullable Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "objekte" ADD COLUMN "sepaZahlungsempfaenger" TEXT;
ALTER TABLE "objekte" ADD COLUMN "sepaGlaeubigerName" TEXT;
ALTER TABLE "objekte" ADD COLUMN "sepaGlaeubigerAnschrift" TEXT;
ALTER TABLE "objekte" ADD COLUMN "sepaGlaeubigerId" TEXT;
