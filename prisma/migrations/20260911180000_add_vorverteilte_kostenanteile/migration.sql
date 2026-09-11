-- CreateTable
CREATE TABLE "vorverteilte_kostenanteile" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vorverteilte_kostenanteile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vorverteilte_kostenanteile_mietvertragId_kostenartId_jahr_key" ON "vorverteilte_kostenanteile"("mietvertragId", "kostenartId", "jahr");

-- AddForeignKey
ALTER TABLE "vorverteilte_kostenanteile" ADD CONSTRAINT "vorverteilte_kostenanteile_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vorverteilte_kostenanteile" ADD CONSTRAINT "vorverteilte_kostenanteile_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
