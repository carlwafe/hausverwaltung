-- CreateTable
CREATE TABLE "jahresbericht_verifikationen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jahresbericht_verifikationen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jahresbericht_verifikationen_mietvertragId_jahr_key" ON "jahresbericht_verifikationen"("mietvertragId", "jahr");

-- AddForeignKey
ALTER TABLE "jahresbericht_verifikationen" ADD CONSTRAINT "jahresbericht_verifikationen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
