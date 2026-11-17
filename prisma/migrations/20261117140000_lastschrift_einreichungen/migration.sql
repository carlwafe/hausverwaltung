-- Merker „Einzugsdatei eingereicht“ für die Seite Lastschrift-Einzug. Neue Tabelle, nichts Bestehendes ändert sich.
CREATE TABLE "lastschrift_einreichungen" (
    "id" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "faelligAm" DATE NOT NULL,
    "anzahl" INTEGER NOT NULL,
    "summeCent" INTEGER NOT NULL,
    "vertragIds" TEXT[],
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lastschrift_einreichungen_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lastschrift_einreichungen_jahr_monat_idx" ON "lastschrift_einreichungen"("jahr", "monat");
