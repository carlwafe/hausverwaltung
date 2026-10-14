-- Darlehenskonto (Soll/Ist): Monat der Rate und Kennzeichen „Sonderbuchung“ an der Darlehen-Zuordnung.
-- Nur neue, optionale Spalten; ändert keine Bestandsdaten.
ALTER TABLE "darlehen_zuordnungen" ADD COLUMN "periodeJahr" INTEGER;
ALTER TABLE "darlehen_zuordnungen" ADD COLUMN "periodeMonat" INTEGER;
ALTER TABLE "darlehen_zuordnungen" ADD COLUMN "sonder" BOOLEAN NOT NULL DEFAULT false;
