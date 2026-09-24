-- AlterTable: Datum, an dem der Einbehalt wirksam wurde (bestimmt das Buchungsdatum der
-- KAUTION_EINBEHALT-Buchung und damit das EÜR-Jahr); null = wie bisher das Erfassungsdatum.
ALTER TABLE "kaution_einbehalte" ADD COLUMN "datum" TIMESTAMP(3);
