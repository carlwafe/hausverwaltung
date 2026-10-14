-- Jahreswerte der Schuldzinsen (andere Konten) hängen jetzt an einem Darlehen der Stammdaten und merken sich den
-- Zeitraum der Raten. Nur neue, nullable Spalten (die Tabelle war bei der Einführung leer): Bestand bleibt unberührt.

-- AlterTable
ALTER TABLE "schuldzinsen_jahreswerte" ADD COLUMN "darlehenId" TEXT,
ADD COLUMN "vonMonat" INTEGER,
ADD COLUMN "bisMonat" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "schuldzinsen_jahreswerte_darlehenId_jahr_key" ON "schuldzinsen_jahreswerte"("darlehenId", "jahr");

-- AddForeignKey
ALTER TABLE "schuldzinsen_jahreswerte" ADD CONSTRAINT "schuldzinsen_jahreswerte_darlehenId_fkey" FOREIGN KEY ("darlehenId") REFERENCES "darlehen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
