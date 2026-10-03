-- Schalter je Nebenkostenabrechnung: mit den eingetragenen Gesamtflächen des Verwalters rechnen
-- (statt sie nur als Vergleichsspalte zu zeigen). Bestehende Abrechnungen bleiben unverändert (false).
ALTER TABLE "nebenkostenabrechnungen" ADD COLUMN "verwalterFlaechen" BOOLEAN NOT NULL DEFAULT false;
