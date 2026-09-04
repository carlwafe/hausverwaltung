-- AlterTable
-- Die alte freitextige "haus"-Spalte wurde bereits per Datenmigration in die neue "haeuser"-Tabelle
-- überführt (siehe Migration 20260904092353_add_haus_model) und wird jetzt entfernt.
ALTER TABLE "gebaeude" DROP COLUMN "haus";
