-- Aufteilen von PDFs mit mehreren Dokumenten: Teile verweisen auf das (ausgeblendete) Original.
-- Nur eine neue, nullable Spalte — bestehende Daten bleiben unberührt.
ALTER TABLE "dokumente" ADD COLUMN "herkunftId" TEXT;
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_herkunftId_fkey"
  FOREIGN KEY ("herkunftId") REFERENCES "dokumente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
