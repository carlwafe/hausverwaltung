-- SEPA-Lastschriftmandat je Mietvertrag (Referenz, Gläubiger-ID, Unterschriftsdatum, Kontoinhaber, IBAN des Zahlers).
-- Nur neue, nullable Spalten.
ALTER TABLE "mietvertraege" ADD COLUMN "mandatReferenz" TEXT;
ALTER TABLE "mietvertraege" ADD COLUMN "mandatGlaeubigerId" TEXT;
ALTER TABLE "mietvertraege" ADD COLUMN "mandatDatum" TIMESTAMP(3);
ALTER TABLE "mietvertraege" ADD COLUMN "mandatKontoinhaber" TEXT;
ALTER TABLE "mietvertraege" ADD COLUMN "mandatIban" TEXT;
