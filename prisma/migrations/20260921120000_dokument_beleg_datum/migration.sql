-- Datum des Belegs (vom Nutzer angegeben, änderbar); createdAt bleibt das Upload-Datum.
ALTER TABLE "dokumente" ADD COLUMN "belegDatum" TIMESTAMP(3);
