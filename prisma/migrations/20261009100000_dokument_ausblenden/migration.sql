-- Löschsperre für Kostenbelege: Belege an Kostenbuchungen werden nicht mehr gelöscht, sondern
-- ausgeblendet (wiederherstellbar). Nur neue, nullable Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "dokumente" ADD COLUMN "ausgeblendetAm" TIMESTAMP(3);
ALTER TABLE "dokumente" ADD COLUMN "ausgeblendetVon" TEXT;
