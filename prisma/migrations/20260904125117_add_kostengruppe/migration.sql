-- Kostengruppe: frei benannte Gruppe mehrerer Gebäude über Haus-Grenzen hinweg (z.B. wenn ein
-- Versorger mehrere physische Häuser gemeinsam abrechnet, wie Techem-Heizkosten für Haus 2-6 +
-- Haus 8-12 zusammen). Many-to-many zu Gebäude, anders als die 1:n-Zuordnung bei Haus.

-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN     "kostengruppeId" TEXT;

-- CreateTable
CREATE TABLE "kostengruppen" (
    "id" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kostengruppen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GebaeudeToKostengruppe" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GebaeudeToKostengruppe_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_GebaeudeToKostengruppe_B_index" ON "_GebaeudeToKostengruppe"("B");

-- CreateIndex
CREATE INDEX "kostenpositionen_kostengruppeId_jahr_idx" ON "kostenpositionen"("kostengruppeId", "jahr");

-- AddForeignKey
ALTER TABLE "kostengruppen" ADD CONSTRAINT "kostengruppen_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_kostengruppeId_fkey" FOREIGN KEY ("kostengruppeId") REFERENCES "kostengruppen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GebaeudeToKostengruppe" ADD CONSTRAINT "_GebaeudeToKostengruppe_A_fkey" FOREIGN KEY ("A") REFERENCES "gebaeude"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GebaeudeToKostengruppe" ADD CONSTRAINT "_GebaeudeToKostengruppe_B_fkey" FOREIGN KEY ("B") REFERENCES "kostengruppen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
