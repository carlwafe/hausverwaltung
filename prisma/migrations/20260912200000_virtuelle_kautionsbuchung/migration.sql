-- "Virtuelle" Buchungen: eine Kaution kann intern (ohne eigene Kontobewegung) mit einer bereits
-- real gebuchten Kostenposition verrechnet werden (z.B. eine Reparatur, die vom Kautionsrest
-- abgezogen wurde). Die KautionBuchung-Seite bekommt dafür eine eigene Kategorie
-- (VIRTUELLE_AUSZAHLUNG), die Kostenposition-Seite einen direkten Link zurück zur zugehörigen
-- Kautionsbuchung — ersetzt den bisher komplett ungenutzten kautionId-Link auf das ganze
-- Kaution-Modell (falscher Detailgrad: verweist auf die Kaution als Ganzes statt auf die
-- konkrete Buchung).

-- AlterEnum
ALTER TYPE "KautionBuchungKategorie" ADD VALUE 'VIRTUELLE_AUSZAHLUNG';

-- Alten, nie genutzten Kaution-Link entfernen
ALTER TABLE "kostenpositionen" DROP CONSTRAINT "kostenpositionen_kautionId_fkey";
DROP INDEX "kostenpositionen_kautionId_idx";
ALTER TABLE "kostenpositionen" DROP COLUMN "kautionId";

-- AlterTable
ALTER TABLE "kostenpositionen" ADD COLUMN "virtuelleKautionBuchungId" TEXT;

-- CreateIndex
CREATE INDEX "kostenpositionen_virtuelleKautionBuchungId_idx" ON "kostenpositionen"("virtuelleKautionBuchungId");

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_virtuelleKautionBuchungId_fkey" FOREIGN KEY ("virtuelleKautionBuchungId") REFERENCES "kautionsbuchungen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
