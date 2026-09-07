-- CreateTable
CREATE TABLE "sonstige_buchungen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT,
    "datum" TIMESTAMP(3) NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "empfaenger" TEXT,
    "verwendungszweck" TEXT,
    "rohdaten" JSONB,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sonstige_buchungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sonstige_buchungen_mietvertragId_idx" ON "sonstige_buchungen"("mietvertragId");

-- AddForeignKey
ALTER TABLE "sonstige_buchungen" ADD CONSTRAINT "sonstige_buchungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sonstige_buchungen" ADD CONSTRAINT "sonstige_buchungen_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
