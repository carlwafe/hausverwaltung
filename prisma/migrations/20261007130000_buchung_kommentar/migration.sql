-- Freitext-Kommentar je Buchung (eigene Tabelle, weil Buchungen unveränderlich sind).
-- Neue Tabelle, ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "buchung_kommentare" (
    "id" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "geaendertVon" TEXT,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buchung_kommentare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buchung_kommentare_buchungId_key" ON "buchung_kommentare"("buchungId");

-- AddForeignKey
ALTER TABLE "buchung_kommentare" ADD CONSTRAINT "buchung_kommentare_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
