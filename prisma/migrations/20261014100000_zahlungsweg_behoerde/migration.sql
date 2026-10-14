-- Neuer Zahlungsweg: Amt/Behörde zahlt die Miete (Jobcenter/Bundesagentur, Kreis Ostholstein).
-- Nur ein zusätzlicher Enum-Wert — bestehende Daten bleiben unberührt.
ALTER TYPE "Zahlungsweg" ADD VALUE 'BEHOERDE';
