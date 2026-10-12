-- Dokumente können sich auf ein Haus (mehrere Hausnummern) beziehen, z.B. Rechnung für „Breslauer Straße 2/6“.
-- Nur eine neue, nullable Spalte — bestehende Daten bleiben unberührt.
ALTER TABLE "dokumente" ADD COLUMN "hausId" TEXT;
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_hausId_fkey"
  FOREIGN KEY ("hausId") REFERENCES "haeuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
