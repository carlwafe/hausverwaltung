-- CreateTable
CREATE TABLE "techem_allgemeinstrom_anteile" (
    "id" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "techem_allgemeinstrom_anteile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "techem_allgemeinstrom_anteile_kostenartId_jahr_key" ON "techem_allgemeinstrom_anteile"("kostenartId", "jahr");

-- AddForeignKey
ALTER TABLE "techem_allgemeinstrom_anteile" ADD CONSTRAINT "techem_allgemeinstrom_anteile_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
