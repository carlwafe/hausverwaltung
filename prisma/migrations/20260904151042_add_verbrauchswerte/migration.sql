-- Verbrauchserfassung: VORVERTEILT-Verteilerschlüssel für extern (z.B. von Techem) bereits
-- pro-Wohnung aufgeschlüsselte Kosten, Verbrauchswert-Tabelle für tatsächlich zu berechnende
-- verbrauchsbasierte Kostenarten (Wasser, Strom).

-- AlterEnum
ALTER TYPE "Verteilerschluessel" ADD VALUE 'VORVERTEILT';

-- AlterTable
ALTER TABLE "kostenarten" ADD COLUMN     "masseinheit" TEXT;

-- CreateTable
CREATE TABLE "verbrauchswerte" (
    "id" TEXT NOT NULL,
    "einheitId" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "wert" DECIMAL(12,3) NOT NULL,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verbrauchswerte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verbrauchswerte_einheitId_kostenartId_jahr_key" ON "verbrauchswerte"("einheitId", "kostenartId", "jahr");

-- AddForeignKey
ALTER TABLE "verbrauchswerte" ADD CONSTRAINT "verbrauchswerte_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verbrauchswerte" ADD CONSTRAINT "verbrauchswerte_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
