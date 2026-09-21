-- Beträge der Techem-Gesamtabrechnung, die nicht auf einen Mieter umgelegt werden (Leerstand).
CREATE TABLE "vorverteilte_leerstaende" (
    "id" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "einheitId" TEXT,
    "betrag" DECIMAL(10,2) NOT NULL,
    "notiz" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vorverteilte_leerstaende_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vorverteilte_leerstaende_kostenartId_jahr_idx" ON "vorverteilte_leerstaende"("kostenartId", "jahr");

ALTER TABLE "vorverteilte_leerstaende" ADD CONSTRAINT "vorverteilte_leerstaende_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vorverteilte_leerstaende" ADD CONSTRAINT "vorverteilte_leerstaende_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;
