-- Zuordnung einer Darlehensrate (Tilgung bzw. reine Zinsbuchung) zu einem Darlehen der Stammdaten. Neue Tabelle
-- (Buchungen sind unveränderlich), ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "darlehen_zuordnungen" (
    "id" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "darlehenId" TEXT NOT NULL,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "darlehen_zuordnungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "darlehen_zuordnungen_buchungId_key" ON "darlehen_zuordnungen"("buchungId");

-- CreateIndex
CREATE INDEX "darlehen_zuordnungen_darlehenId_idx" ON "darlehen_zuordnungen"("darlehenId");

-- AddForeignKey
ALTER TABLE "darlehen_zuordnungen" ADD CONSTRAINT "darlehen_zuordnungen_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "darlehen_zuordnungen" ADD CONSTRAINT "darlehen_zuordnungen_darlehenId_fkey" FOREIGN KEY ("darlehenId") REFERENCES "darlehen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
