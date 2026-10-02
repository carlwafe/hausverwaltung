-- Modus je Nebenkostenabrechnung: manuell geführt (Positionen von Hand, "Neu berechnen" gesperrt).
-- Bestehende Abrechnungen bleiben unverändert (false); der Nutzer stellt sie auf der Seite um.
ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN "manuell" BOOLEAN NOT NULL DEFAULT false;
