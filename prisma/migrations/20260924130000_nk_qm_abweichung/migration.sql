-- CreateTable
CREATE TABLE "nebenkosten_qm_abweichungen" (
    "id" TEXT NOT NULL,
    "abrechnungId" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "scopeLabel" TEXT NOT NULL,
    "qmGesamt" DECIMAL(10,3) NOT NULL,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nebenkosten_qm_abweichungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nebenkosten_qm_abweichungen_abrechnungId_kostenartId_scopeLabel_key" ON "nebenkosten_qm_abweichungen"("abrechnungId", "kostenartId", "scopeLabel");

-- AddForeignKey
ALTER TABLE "nebenkosten_qm_abweichungen" ADD CONSTRAINT "nebenkosten_qm_abweichungen_abrechnungId_fkey" FOREIGN KEY ("abrechnungId") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkosten_qm_abweichungen" ADD CONSTRAINT "nebenkosten_qm_abweichungen_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
