-- CreateTable
CREATE TABLE "dienstleister" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suchbegriffe" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "gebaeudeAuswahl" TEXT,
    "iban" TEXT,
    "notiz" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dienstleister_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dienstleister_kostenartId_idx" ON "dienstleister"("kostenartId");

-- AddForeignKey
ALTER TABLE "dienstleister" ADD CONSTRAINT "dienstleister_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
