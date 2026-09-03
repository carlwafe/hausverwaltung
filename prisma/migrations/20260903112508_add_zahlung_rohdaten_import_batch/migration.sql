/*
  Warnings:

  - Added the required column `speicherpfad` to the `import_batches` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Bestehende Batches (vor Einführung des lokalen Datei-Storage) haben keine Originaldatei mehr;
-- sie bekommen einen Platzhalter statt eines echten Pfads.
ALTER TABLE "import_batches" ADD COLUMN     "speicherpfad" TEXT NOT NULL DEFAULT 'unbekannt';
ALTER TABLE "import_batches" ALTER COLUMN "speicherpfad" DROP DEFAULT;

-- AlterTable
ALTER TABLE "zahlungen" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "rohdaten" JSONB;

-- AddForeignKey
ALTER TABLE "zahlungen" ADD CONSTRAINT "zahlungen_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
