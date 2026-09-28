-- Macht 20260928160000_kaution_einbehalt_verrechnet rückgängig (Funktion wieder entfernt: ein
-- Einbehalt wird stattdessen storniert und eine virtuelle Auszahlung neu angelegt).
ALTER TABLE "kaution_einbehalte" DROP COLUMN "virtuelleAuszahlungId";

-- Postgres kann einen Enum-Wert nicht direkt entfernen: Typ ohne VERRECHNET neu anlegen.
ALTER TYPE "KautionEinbehaltStatus" RENAME TO "KautionEinbehaltStatus_alt";
CREATE TYPE "KautionEinbehaltStatus" AS ENUM ('UNSTRITTIG', 'STRITTIG_OFFEN', 'STRITTIG_BESTAETIGT', 'STRITTIG_VERWORFEN');
ALTER TABLE "kaution_einbehalte" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "kaution_einbehalte" ALTER COLUMN "status" TYPE "KautionEinbehaltStatus" USING ("status"::text::"KautionEinbehaltStatus");
ALTER TABLE "kaution_einbehalte" ALTER COLUMN "status" SET DEFAULT 'STRITTIG_OFFEN';
DROP TYPE "KautionEinbehaltStatus_alt";
