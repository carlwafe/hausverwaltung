-- Neuer Verteilerschlüssel für Kostenarten, die bereits in einer extern vorverteilten Abrechnung
-- (Techem) enthalten sind.
ALTER TYPE "Verteilerschluessel" ADD VALUE 'IN_ABRECHNUNG_ENTHALTEN';
