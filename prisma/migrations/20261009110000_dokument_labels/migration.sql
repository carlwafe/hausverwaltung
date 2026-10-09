-- Labels an Dokumenten für die automatische Zuordnung (Eingang, Aussteller, Rechnungsnummer, Betrag,
-- Leistungszeitraum, Kostenjahr, IBAN, Kostenart, Adressat, Objekt) sowie das Ergebnis der Texterkennung.
-- Nur neue, nullable bzw. mit Standardwert versehene Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "dokumente" ADD COLUMN "eingang" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "dokumente" ADD COLUMN "aussteller" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "rechnungsnummer" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "betrag" DECIMAL(10,2);
ALTER TABLE "dokumente" ADD COLUMN "leistungVon" TIMESTAMP(3);
ALTER TABLE "dokumente" ADD COLUMN "leistungBis" TIMESTAMP(3);
ALTER TABLE "dokumente" ADD COLUMN "kostenjahr" INTEGER;
ALTER TABLE "dokumente" ADD COLUMN "iban" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "kostenartId" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "adressat" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "objektHinweis" TEXT;
ALTER TABLE "dokumente" ADD COLUMN "erkennung" JSONB;
ALTER TABLE "dokumente" ADD COLUMN "erkanntAm" TIMESTAMP(3);

ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_kostenartId_fkey"
  FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE SET NULL ON UPDATE CASCADE;
