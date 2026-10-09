-- Dokumente dürfen mehrere Bezüge haben (neu: Gebäude) und eine Kurzbeschreibung (titel) tragen.
-- Nur neue, nullable Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "dokumente" ADD COLUMN "gebaeudeId" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "titel" TEXT;

ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_gebaeudeId_fkey"
  FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE SET NULL ON UPDATE CASCADE;
