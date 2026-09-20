-- CreateEnum
CREATE TYPE "Kontokreis" AS ENUM ('MIETKONTO', 'KAUTIONSKONTO', 'OBJEKTKONTO');

-- CreateEnum
CREATE TYPE "KautionEinbehaltStatus" AS ENUM ('UNSTRITTIG', 'STRITTIG_OFFEN', 'STRITTIG_BESTAETIGT', 'STRITTIG_VERWORFEN');

-- DropForeignKey
ALTER TABLE "zahlungen" DROP CONSTRAINT IF EXISTS "zahlungen_mietvertragId_fkey";

-- DropForeignKey
ALTER TABLE "zahlungen" DROP CONSTRAINT IF EXISTS "zahlungen_importBatchId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_kostenartId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_gebaeudeId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_hausId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_kostengruppeId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_einheitId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_importBatchId_fkey";

-- DropForeignKey
ALTER TABLE "kostenpositionen" DROP CONSTRAINT IF EXISTS "kostenpositionen_virtuelleKautionBuchungId_fkey";

-- DropForeignKey
ALTER TABLE "dokumente" DROP CONSTRAINT IF EXISTS "dokumente_kostenpositionId_fkey";

-- DropForeignKey
ALTER TABLE "eigentuemerbuchungen" DROP CONSTRAINT IF EXISTS "eigentuemerbuchungen_importBatchId_fkey";

-- DropForeignKey
ALTER TABLE "kautionsbuchungen" DROP CONSTRAINT IF EXISTS "kautionsbuchungen_mietvertragId_fkey";

-- DropForeignKey
ALTER TABLE "kautionsbuchungen" DROP CONSTRAINT IF EXISTS "kautionsbuchungen_importBatchId_fkey";

-- DropForeignKey
ALTER TABLE "nebenkostenausgleich_zahlungen" DROP CONSTRAINT IF EXISTS "nebenkostenausgleich_zahlungen_mietvertragId_fkey";

-- DropForeignKey
ALTER TABLE "nebenkostenausgleich_zahlungen" DROP CONSTRAINT IF EXISTS "nebenkostenausgleich_zahlungen_importBatchId_fkey";

-- AlterTable
ALTER TABLE "kostenarten" ADD COLUMN     "betrKvNummer" INTEGER,
ADD COLUMN     "istSonstigeBetriebskosten" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vertraglicheGrundlage" TEXT;

-- AlterTable
ALTER TABLE "dokumente" DROP COLUMN "kostenpositionId",
ADD COLUMN     "buchungId" TEXT;

-- DropTable
DROP TABLE "zahlungen";

-- DropTable
DROP TABLE "kostenpositionen";

-- DropTable
DROP TABLE "eigentuemerbuchungen";

-- DropTable
DROP TABLE "kautionsbuchungen";

-- DropTable
DROP TABLE "nebenkostenausgleich_zahlungen";

-- DropEnum
DROP TYPE "KautionBuchungKategorie";

-- CreateTable
CREATE TABLE "buchungsarten" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "kontokreis" "Kontokreis" NOT NULL,
    "zahlungswirksam" BOOLEAN NOT NULL,
    "eurRelevant" BOOLEAN NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buchungsarten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buchungen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT,
    "buchungsartId" TEXT NOT NULL,
    "datum" TIMESTAMP(3),
    "betrag" DECIMAL(10,2) NOT NULL,
    "kostenartId" TEXT,
    "gebaeudeId" TEXT,
    "hausId" TEXT,
    "kostengruppeId" TEXT,
    "einheitId" TEXT,
    "periodeMonat" INTEGER,
    "periodeJahr" INTEGER,
    "jahr" INTEGER,
    "empfaenger" TEXT,
    "verwendungszweck" TEXT,
    "bemerkung" TEXT,
    "bezugTyp" TEXT,
    "bezugId" TEXT,
    "rohdaten" JSONB,
    "importBatchId" TEXT,
    "aufteilungGruppeId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erstelltVon" TEXT,
    "storniertDurchBuchungId" TEXT,

    CONSTRAINT "buchungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kaution_einbehalte" (
    "id" TEXT NOT NULL,
    "kautionId" TEXT NOT NULL,
    "positionText" TEXT NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "bezugTyp" TEXT,
    "bezugId" TEXT,
    "status" "KautionEinbehaltStatus" NOT NULL DEFAULT 'STRITTIG_OFFEN',
    "belegId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusGeaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "buchungId" TEXT,

    CONSTRAINT "kaution_einbehalte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kontenabgleich_verifikationen" (
    "id" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "kontostandLautBankauszug" DECIMAL(10,2) NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kontenabgleich_verifikationen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buchungsarten_code_key" ON "buchungsarten"("code");

-- CreateIndex
CREATE UNIQUE INDEX "buchungen_storniertDurchBuchungId_key" ON "buchungen"("storniertDurchBuchungId");

-- CreateIndex
CREATE INDEX "buchungen_mietvertragId_datum_idx" ON "buchungen"("mietvertragId", "datum");

-- CreateIndex
CREATE INDEX "buchungen_buchungsartId_idx" ON "buchungen"("buchungsartId");

-- CreateIndex
CREATE INDEX "buchungen_kostenartId_idx" ON "buchungen"("kostenartId");

-- CreateIndex
CREATE INDEX "buchungen_aufteilungGruppeId_idx" ON "buchungen"("aufteilungGruppeId");

-- CreateIndex
CREATE UNIQUE INDEX "kaution_einbehalte_buchungId_key" ON "kaution_einbehalte"("buchungId");

-- CreateIndex
CREATE INDEX "kaution_einbehalte_kautionId_idx" ON "kaution_einbehalte"("kautionId");

-- CreateIndex
CREATE UNIQUE INDEX "kontenabgleich_verifikationen_jahr_key" ON "kontenabgleich_verifikationen"("jahr");

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_buchungsartId_fkey" FOREIGN KEY ("buchungsartId") REFERENCES "buchungsarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "haeuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_kostengruppeId_fkey" FOREIGN KEY ("kostengruppeId") REFERENCES "kostengruppen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buchungen" ADD CONSTRAINT "buchungen_storniertDurchBuchungId_fkey" FOREIGN KEY ("storniertDurchBuchungId") REFERENCES "buchungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaution_einbehalte" ADD CONSTRAINT "kaution_einbehalte_kautionId_fkey" FOREIGN KEY ("kautionId") REFERENCES "kautionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kaution_einbehalte" ADD CONSTRAINT "kaution_einbehalte_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

