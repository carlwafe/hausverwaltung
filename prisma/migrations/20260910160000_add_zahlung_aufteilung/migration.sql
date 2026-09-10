-- Zahlung kann jetzt wie eine Kostenposition auf mehrere Mietverträge aufgeteilt werden.

-- AlterTable
ALTER TABLE "zahlungen" ADD COLUMN     "aufteilungGruppeId" TEXT;

-- CreateIndex
CREATE INDEX "zahlungen_aufteilungGruppeId_idx" ON "zahlungen"("aufteilungGruppeId");
