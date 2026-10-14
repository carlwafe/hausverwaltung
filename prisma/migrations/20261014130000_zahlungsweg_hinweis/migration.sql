-- Warnung am Mietvertrag, wenn die jüngsten Zahlungen nicht mehr zum erfassten Zahlungsweg passen.
-- Nur neue, nullable Spalten.
ALTER TABLE "mietvertraege" ADD COLUMN "zahlungswegHinweis" "Zahlungsweg";
ALTER TABLE "mietvertraege" ADD COLUMN "zahlungswegHinweisVerworfen" "Zahlungsweg";
