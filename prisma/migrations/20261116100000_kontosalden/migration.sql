-- Kontostand laut Bank je Buchungstag (aus den Salden der CAMT-XML-Dateien). Neue Tabelle, nichts Bestehendes ändert sich.
CREATE TABLE "kontosalden" (
    "id" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "iban" TEXT,
    "anfangssaldo" DECIMAL(14,2),
    "endsaldo" DECIMAL(14,2) NOT NULL,
    "anzahlUmsaetze" INTEGER NOT NULL DEFAULT 0,
    "summeUmsaetze" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "quelle" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kontosalden_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kontosalden_datum_key" ON "kontosalden"("datum");
