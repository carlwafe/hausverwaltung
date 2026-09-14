-- "sonstige_buchungen" wurde in der Praxis ausschließlich vom Nebenkostenausgleich-Import
-- befüllt — wird zu "nebenkostenausgleich_zahlungen" umbenannt und bekommt ein optionales
-- "jahr" (Abrechnungsjahr), damit eine Zahlung unabhängig vom Bestehen einer
-- Nebenkostenabrechnung importiert und später automatisch mit der passenden Position
-- verknüpft werden kann.
-- RenameTable
ALTER TABLE "sonstige_buchungen" RENAME TO "nebenkostenausgleich_zahlungen";
-- AlterTable
ALTER TABLE "nebenkostenausgleich_zahlungen" ADD COLUMN "jahr" INTEGER;
-- CreateIndex
CREATE INDEX "nebenkostenausgleich_zahlungen_mietvertragId_jahr_idx" ON "nebenkostenausgleich_zahlungen"("mietvertragId", "jahr");
