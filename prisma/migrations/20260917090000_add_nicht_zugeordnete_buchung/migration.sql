-- CreateTable
CREATE TABLE "nicht_zugeordnete_buchungen" (
    "id" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "empfaenger" TEXT,
    "verwendungszweck" TEXT,
    "quelle" TEXT,
    "rohdaten" JSONB,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nicht_zugeordnete_buchungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nicht_zugeordnete_buchungen_datum_betrag_idx" ON "nicht_zugeordnete_buchungen"("datum", "betrag");

-- AddForeignKey
ALTER TABLE "nicht_zugeordnete_buchungen" ADD CONSTRAINT "nicht_zugeordnete_buchungen_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
