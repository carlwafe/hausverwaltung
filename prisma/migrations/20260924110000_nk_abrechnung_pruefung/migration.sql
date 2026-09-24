-- CreateTable
CREATE TABLE "nebenkostenabrechnung_pruefungen" (
    "id" TEXT NOT NULL,
    "abrechnungId" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "stimmtMitVerwalter" BOOLEAN NOT NULL DEFAULT false,
    "kommentar" TEXT,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nebenkostenabrechnung_pruefungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnung_pruefungen_abrechnungId_mietvertragId_key" ON "nebenkostenabrechnung_pruefungen"("abrechnungId", "mietvertragId");

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnung_pruefungen" ADD CONSTRAINT "nebenkostenabrechnung_pruefungen_abrechnungId_fkey" FOREIGN KEY ("abrechnungId") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnung_pruefungen" ADD CONSTRAINT "nebenkostenabrechnung_pruefungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
