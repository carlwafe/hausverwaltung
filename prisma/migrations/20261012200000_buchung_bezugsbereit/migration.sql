-- Datum „bezugsbereit ab“ für Anschaffungs-/Herstellungskosten (Beginn der Abschreibung).
-- Nur eine neue, nullable Spalte — bestehende Buchungen bleiben unberührt (NULL = nicht angegeben).
ALTER TABLE "buchungen" ADD COLUMN "bezugsbereitAb" TIMESTAMP(3);
