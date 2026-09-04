-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT "kostenpositionen_gebaeudeId_fkey";

-- AlterTable
ALTER TABLE "kostenpositionen" ALTER COLUMN "gebaeudeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE SET NULL ON UPDATE CASCADE;
