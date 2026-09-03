-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT "kostenpositionen_objektId_fkey";

-- DropForeignKey
ALTER TABLE "nebenkostenabrechnungen" DROP CONSTRAINT "nebenkostenabrechnungen_objektId_fkey";

-- DropIndex
DROP INDEX "kostenpositionen_objektId_jahr_idx";

-- DropIndex
DROP INDEX "nebenkostenabrechnungen_objektId_jahr_key";

-- AlterTable
ALTER TABLE "einheiten" ADD COLUMN     "gebaeudeId" TEXT;

-- AlterTable
ALTER TABLE "kostenpositionen" DROP COLUMN "objektId",
ADD COLUMN     "gebaeudeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "nebenkostenabrechnungen" DROP COLUMN "objektId",
ADD COLUMN     "gebaeudeId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "gebaeude" (
    "id" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "hausnummer" TEXT NOT NULL,
    "beschreibung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gebaeude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gebaeude_objektId_strasse_hausnummer_key" ON "gebaeude"("objektId", "strasse", "hausnummer");

-- CreateIndex
CREATE INDEX "kostenpositionen_gebaeudeId_jahr_idx" ON "kostenpositionen"("gebaeudeId", "jahr");

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnungen_gebaeudeId_jahr_key" ON "nebenkostenabrechnungen"("gebaeudeId", "jahr");

-- AddForeignKey
ALTER TABLE "gebaeude" ADD CONSTRAINT "gebaeude_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnungen" ADD CONSTRAINT "nebenkostenabrechnungen_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE CASCADE ON UPDATE CASCADE;

