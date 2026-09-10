-- Kategorisierung von Kautionsbuchungen: Einzahlung Mieter, Anlage (aufs Kautionskonto),
-- Auflösung (vom Kautionskonto zurück), Auszahlung Mieter. Bereits importierte Altbuchungen
-- bekommen automatisch den Platzhalter NICHT_ZUGEORDNET über den Spalten-Default.

-- CreateEnum
CREATE TYPE "KautionBuchungKategorie" AS ENUM ('EINZAHLUNG_MIETER', 'ANLAGE', 'AUFLOESUNG', 'AUSZAHLUNG_MIETER', 'NICHT_ZUGEORDNET');

-- AlterTable
ALTER TABLE "kautionsbuchungen" ADD COLUMN     "kategorie" "KautionBuchungKategorie" NOT NULL DEFAULT 'NICHT_ZUGEORDNET';
