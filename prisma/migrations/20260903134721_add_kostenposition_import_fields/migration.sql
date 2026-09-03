-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN     "datum" TIMESTAMP(3),
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "rohdaten" JSONB;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
