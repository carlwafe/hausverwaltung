-- Postanschrift am Mieter (neue Anschrift ausgezogener Mieter, Wohnort externer Garagenmieter). Nur neue nullable Spalten.

-- AlterTable
ALTER TABLE "mieter" ADD COLUMN "anschriftStrasse" TEXT,
ADD COLUMN "anschriftPlz" TEXT,
ADD COLUMN "anschriftOrt" TEXT;
