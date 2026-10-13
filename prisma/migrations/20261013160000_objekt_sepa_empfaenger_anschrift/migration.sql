-- Optionale Anschrift des SEPA-Zahlungsempfängers (Vermieterin) für die Lastschriftmandate.
-- Nur eine neue, nullable Spalte — bestehende Daten bleiben unberührt.
ALTER TABLE "objekte" ADD COLUMN "sepaZahlungsempfaengerAnschrift" TEXT;
