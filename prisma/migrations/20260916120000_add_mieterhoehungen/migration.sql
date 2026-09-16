-- CreateTable
CREATE TABLE "mieterhoehungen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "gueltigAb" TIMESTAMP(3) NOT NULL,
    "kaltmiete" DECIMAL(10,2) NOT NULL,
    "nebenkostenVorauszahlung" DECIMAL(10,2) NOT NULL,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mieterhoehungen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mieterhoehungen_mietvertragId_gueltigAb_key" ON "mieterhoehungen"("mietvertragId", "gueltigAb");

-- AddForeignKey
ALTER TABLE "mieterhoehungen" ADD CONSTRAINT "mieterhoehungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
