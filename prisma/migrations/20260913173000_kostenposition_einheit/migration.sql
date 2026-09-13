-- Kostenpositionen (z.B. Reparaturen, Sanierungsarbeiten) lassen sich jetzt zusätzlich einer
-- einzelnen Einheit zuordnen — spezifischer als gebaeudeId/hausId/kostengruppeId, für Kosten,
-- die nur eine einzelne Wohnung betreffen.

-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN "einheitId" TEXT;

-- CreateIndex
CREATE INDEX "kostenpositionen_einheitId_jahr_idx" ON "kostenpositionen"("einheitId", "jahr");

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;
