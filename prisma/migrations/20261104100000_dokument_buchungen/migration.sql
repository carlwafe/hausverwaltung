-- Ein Beleg für mehrere Kostenpositionen (z.B. Jahresrechnung für zwölf Abschläge). Neue Tabelle, ändert keine Bestandsdaten;
-- Dokument.buchungId bleibt die Hauptposition.

-- CreateTable
CREATE TABLE "dokument_buchungen" (
    "id" TEXT NOT NULL,
    "dokumentId" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstelltVon" TEXT,

    CONSTRAINT "dokument_buchungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dokument_buchungen_dokumentId_buchungId_key" ON "dokument_buchungen"("dokumentId", "buchungId");

-- CreateIndex
CREATE INDEX "dokument_buchungen_buchungId_idx" ON "dokument_buchungen"("buchungId");

-- AddForeignKey
ALTER TABLE "dokument_buchungen" ADD CONSTRAINT "dokument_buchungen_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "dokumente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokument_buchungen" ADD CONSTRAINT "dokument_buchungen_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
