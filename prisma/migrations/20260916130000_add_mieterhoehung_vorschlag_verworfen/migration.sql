-- CreateTable
CREATE TABLE "mieterhoehung_vorschlaege_verworfen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "abJahr" INTEGER NOT NULL,
    "abMonat" INTEGER NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mieterhoehung_vorschlaege_verworfen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mieterhoehung_vorschlaege_verworfen_mietvertragId_abJahr_a_key" ON "mieterhoehung_vorschlaege_verworfen"("mietvertragId", "abJahr", "abMonat");

-- AddForeignKey
ALTER TABLE "mieterhoehung_vorschlaege_verworfen" ADD CONSTRAINT "mieterhoehung_vorschlaege_verworfen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
