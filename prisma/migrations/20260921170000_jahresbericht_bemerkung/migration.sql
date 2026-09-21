-- CreateTable
CREATE TABLE "jahresbericht_bemerkungen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jahresbericht_bemerkungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jahresbericht_bemerkungen_mietvertragId_jahr_key" ON "jahresbericht_bemerkungen"("mietvertragId", "jahr");

-- AddForeignKey
ALTER TABLE "jahresbericht_bemerkungen" ADD CONSTRAINT "jahresbericht_bemerkungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
