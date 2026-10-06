-- Verbraucherpreisindex (Monatswerte) für die Indexmiete; Werte werden von Hand gepflegt.
CREATE TABLE "verbraucherpreisindex" (
    "id" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "wert" DECIMAL(7,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verbraucherpreisindex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verbraucherpreisindex_jahr_monat_key" ON "verbraucherpreisindex"("jahr", "monat");
