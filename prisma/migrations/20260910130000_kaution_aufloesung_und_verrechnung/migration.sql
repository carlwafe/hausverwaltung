-- Kaution: zweistufiger Rückzahlungsprozess (Auflösung des Kautionskontos, dann tatsächliche
-- Auszahlung an den Mieter) statt eines einzigen Rückzahlungs-Zeitpunkts, plus manuelle
-- Verrechnung einbehaltener Beträge mit Kostenpositionen (z.B. Reparaturen).

-- AlterEnum
ALTER TYPE "KautionStatus" ADD VALUE 'AUFGELOEST';

-- AlterTable
ALTER TABLE "kautionen" ADD COLUMN     "aufloesungsdatum" TIMESTAMP(3),
ADD COLUMN     "aufloesungsbetrag" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN     "kautionId" TEXT;

-- CreateIndex
CREATE INDEX "kostenpositionen_kautionId_idx" ON "kostenpositionen"("kautionId");

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_kautionId_fkey" FOREIGN KEY ("kautionId") REFERENCES "kautionen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
