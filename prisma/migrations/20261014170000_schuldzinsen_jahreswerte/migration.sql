-- Schuldzinsen laut Bankbescheinigung für Darlehensraten, die nicht über das Mietkonto gezahlt wurden
-- (Jahreswerte für die Aufstellung für die Steuererklärung). Neue Tabelle, ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "schuldzinsen_jahreswerte" (
    "id" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "betrag" DECIMAL(12,2) NOT NULL,
    "bemerkung" TEXT,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schuldzinsen_jahreswerte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schuldzinsen_jahreswerte_jahr_idx" ON "schuldzinsen_jahreswerte"("jahr");
