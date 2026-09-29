-- Typ: Handwerker / Sonstige (statt Dienstleister / Lieferant). Alle bisherigen Einträge -> SONSTIGE.
CREATE TYPE "DienstleisterTyp_neu" AS ENUM ('HANDWERKER', 'SONSTIGE');

ALTER TABLE "dienstleister" ALTER COLUMN "typ" DROP DEFAULT;
ALTER TABLE "dienstleister" ALTER COLUMN "typ" TYPE "DienstleisterTyp_neu" USING ('SONSTIGE'::"DienstleisterTyp_neu");
ALTER TABLE "dienstleister" ALTER COLUMN "typ" SET DEFAULT 'SONSTIGE';

DROP TYPE "DienstleisterTyp";
ALTER TYPE "DienstleisterTyp_neu" RENAME TO "DienstleisterTyp";
