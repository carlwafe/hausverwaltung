-- Nebenkostenabrechnung wird von "pro Gebäude + Jahr" auf "pro Jahr fürs ganze Objekt"
-- umgestellt (Kosten liegen inzwischen auf drei Ebenen: Objekt/Haus/Gebäude), und
-- NebenkostenabrechnungPosition erlaubt jetzt mehrere Zeilen pro Einheit (eine je Mietvertrag,
-- der die Einheit im Abrechnungsjahr zeitweise innehatte, z.B. bei einem Mieterwechsel). Beide
-- Tabellen sind zum Zeitpunkt dieser Migration leer (Feature nie genutzt) — keine Datenmigration
-- nötig.

-- DropForeignKey
ALTER TABLE "nebenkostenabrechnungen" DROP CONSTRAINT "nebenkostenabrechnungen_gebaeudeId_fkey";

-- DropIndex
DROP INDEX "nebenkostenabrechnung_positionen_abrechnungId_einheitId_key";

-- DropIndex
DROP INDEX "nebenkostenabrechnungen_gebaeudeId_jahr_key";

-- AlterTable
ALTER TABLE "nebenkostenabrechnung_positionen" ADD COLUMN     "zeitraumBis" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "zeitraumVon" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "nebenkostenabrechnungen" DROP COLUMN "gebaeudeId";

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnung_positionen_abrechnungId_einheitId_mie_key" ON "nebenkostenabrechnung_positionen"("abrechnungId", "einheitId", "mietvertragId");

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnungen_jahr_key" ON "nebenkostenabrechnungen"("jahr");
