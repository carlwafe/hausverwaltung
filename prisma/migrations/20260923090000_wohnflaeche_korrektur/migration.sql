-- CreateTable
CREATE TABLE "wohnflaeche_korrekturen" (
    "id" TEXT NOT NULL,
    "einheitId" TEXT NOT NULL,
    "bisJahr" INTEGER NOT NULL,
    "wohnflaecheQm" DECIMAL(8,2) NOT NULL,
    "notizen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wohnflaeche_korrekturen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wohnflaeche_korrekturen_einheitId_bisJahr_key" ON "wohnflaeche_korrekturen"("einheitId", "bisJahr");

-- AddForeignKey
ALTER TABLE "wohnflaeche_korrekturen" ADD CONSTRAINT "wohnflaeche_korrekturen_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
