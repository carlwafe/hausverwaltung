-- Quartalsübersicht: Sternchen, Kommentare und Kontenabgleich-Verifikation je Quartal.
-- quartal = 0 bedeutet Jahresübersicht (bestehende Zeilen), 1–4 die Quartale.

ALTER TABLE "jahresbericht_verifikationen" ADD COLUMN "quartal" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "jahresbericht_verifikationen_mietvertragId_jahr_key";
CREATE UNIQUE INDEX "jahresbericht_verifikationen_mietvertragId_jahr_quartal_key" ON "jahresbericht_verifikationen"("mietvertragId", "jahr", "quartal");

ALTER TABLE "jahresbericht_kommentare" ADD COLUMN "quartal" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "jahresbericht_kommentare_mietvertragId_jahr_key";
CREATE UNIQUE INDEX "jahresbericht_kommentare_mietvertragId_jahr_quartal_key" ON "jahresbericht_kommentare"("mietvertragId", "jahr", "quartal");

ALTER TABLE "kontenabgleich_verifikationen" ADD COLUMN "quartal" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "kontenabgleich_verifikationen_jahr_key";
CREATE UNIQUE INDEX "kontenabgleich_verifikationen_jahr_quartal_key" ON "kontenabgleich_verifikationen"("jahr", "quartal");
