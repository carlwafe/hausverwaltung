-- Die Spalte „Vertrag gekündigt am“ war ein Missverständnis (gemeint war die Kündigung der alten
-- Verwaltung, nicht des Dienstleisters) und wird nicht verwendet. Spalte ist erst am 08.10.2026
-- angelegt worden und leer.
ALTER TABLE "dienstleister" DROP COLUMN "vertragGekuendigtAm";
