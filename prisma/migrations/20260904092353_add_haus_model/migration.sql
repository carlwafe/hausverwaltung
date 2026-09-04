-- CreateTable
CREATE TABLE "haeuser" (
    "id" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "haeuser_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "gebaeude" ADD COLUMN "hausId" TEXT;

-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN "hausId" TEXT;

-- CreateIndex
CREATE INDEX "kostenpositionen_hausId_jahr_idx" ON "kostenpositionen"("hausId", "jahr");

-- AddForeignKey
ALTER TABLE "haeuser" ADD CONSTRAINT "haeuser_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gebaeude" ADD CONSTRAINT "gebaeude_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "haeuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "haeuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
