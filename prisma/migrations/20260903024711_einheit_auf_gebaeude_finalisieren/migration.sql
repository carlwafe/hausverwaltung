-- DropForeignKey
ALTER TABLE "einheiten" DROP CONSTRAINT "einheiten_objektId_fkey";

-- DropIndex
DROP INDEX "einheiten_objektId_bezeichnung_key";

-- AlterTable
ALTER TABLE "einheiten" DROP COLUMN "objektId",
ALTER COLUMN "gebaeudeId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "einheiten_gebaeudeId_bezeichnung_key" ON "einheiten"("gebaeudeId", "bezeichnung");

