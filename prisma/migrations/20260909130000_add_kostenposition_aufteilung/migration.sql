-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN "aufteilungGruppeId" TEXT;

-- CreateIndex
CREATE INDEX "kostenpositionen_aufteilungGruppeId_idx" ON "kostenpositionen"("aufteilungGruppeId");
