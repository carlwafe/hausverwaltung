-- Dokumentart (Vertrag, Schreiben, Protokoll, Rechnung, Bescheid, Foto, Sonstiges) als Schlagwort
-- für Filter auf /dokumente; leer = nicht angegeben. Gültige Werte prüft die Anwendung.
ALTER TABLE "dokumente" ADD COLUMN "art" TEXT;
