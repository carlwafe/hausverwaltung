-- Arbeitskostenanteil je Kostenposition (Ausweis haushaltsnaher Dienstleistungen, § 35a EStG, im Schreiben
-- „Betriebskostenabrechnung“); eigene Tabelle, weil Buchungen unveränderlich sind. Neue Tabelle, ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "buchung_arbeitskosten" (
    "id" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "geaendertVon" TEXT,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buchung_arbeitskosten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buchung_arbeitskosten_buchungId_key" ON "buchung_arbeitskosten"("buchungId");

-- AddForeignKey
ALTER TABLE "buchung_arbeitskosten" ADD CONSTRAINT "buchung_arbeitskosten_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
