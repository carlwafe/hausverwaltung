-- CreateTable
CREATE TABLE "jahresbericht_kommentare" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "kommentar" TEXT NOT NULL,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jahresbericht_kommentare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jahresbericht_kommentare_mietvertragId_jahr_key" ON "jahresbericht_kommentare"("mietvertragId", "jahr");

-- AddForeignKey
ALTER TABLE "jahresbericht_kommentare" ADD CONSTRAINT "jahresbericht_kommentare_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
