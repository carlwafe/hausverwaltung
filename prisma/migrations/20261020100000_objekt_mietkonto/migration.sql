-- Bankverbindung des Mietkontos am Objekt (Kontoinhaber, IBAN, BIC, Bank).
-- Nur neue, nullable Spalten — bestehende Daten bleiben unberührt.
ALTER TABLE "objekte" ADD COLUMN "mietkontoInhaber" TEXT;
ALTER TABLE "objekte" ADD COLUMN "mietkontoIban" TEXT;
ALTER TABLE "objekte" ADD COLUMN "mietkontoBic" TEXT;
ALTER TABLE "objekte" ADD COLUMN "mietkontoBank" TEXT;
