-- Neuer Wert für die steuerliche Einordnung einer Kostenart: Anschaffungs-/Herstellungskosten
-- (Abschreibung über die Nutzungsdauer statt Sofortabzug, z.B. Einbauküche, Modernisierung).
-- Nur ein zusätzlicher Enum-Wert — bestehende Daten bleiben unberührt, keine Kostenart wird umgestellt.
ALTER TYPE "AnlageVZeile" ADD VALUE 'ANSCHAFFUNG';
