-- Darlehen mit nachgerechnetem Tilgungsplan (Seite „Tilgungspläne“). Neue Tabelle, ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "darlehen" (
    "id" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "darlehensnummer" TEXT,
    "bank" TEXT,
    "darlehensbetrag" DECIMAL(14,2) NOT NULL,
    "startRestschuld" DECIMAL(14,2) NOT NULL,
    "startDatum" DATE NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "zinssatz" DECIMAL(7,4) NOT NULL,
    "zahltag" INTEGER NOT NULL DEFAULT 15,
    "zinsbindungBis" DATE,
    "laufzeitEnde" DATE,
    "stufen" JSONB,
    "bankwerte" JSONB,
    "bemerkung" TEXT,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltVon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "darlehen_pkey" PRIMARY KEY ("id")
);
