-- Entfernt die ungenutzten Spalten des verworfenen „Zahlungsempfänger“-Entwurfs (Gläubigerin ist jetzt die Vermieterin,
-- Angaben in sepaGlaeubigerName/-Anschrift/-Id). Der Code liest sie seit Commit 488ef3f nicht mehr.
ALTER TABLE "objekte" DROP COLUMN "sepaZahlungsempfaenger";
ALTER TABLE "objekte" DROP COLUMN "sepaZahlungsempfaengerAnschrift";
