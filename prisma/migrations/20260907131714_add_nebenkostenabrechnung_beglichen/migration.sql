-- AlterTable
ALTER TABLE "nebenkostenabrechnung_positionen"
ADD COLUMN "beglichenAm" TIMESTAMP(3),
ADD COLUMN "beglichenBetrag" DECIMAL(10,2);
