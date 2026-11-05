-- Belegprüfung für alle Kostenarten (nicht nur umlagefähige): Kennzeichen, ob für eine Kostenart ein Einzelbeleg verlangt wird.
-- Standard: ja. Ausnahmen (Kontoauszug bzw. interne Forderung ist der Beleg): Bankgebühren, Mahngebühren, Verzugszinsen,
-- Mietminderung, Waschgeld. Ändert keine Buchungen.

-- AlterTable
ALTER TABLE "kostenarten" ADD COLUMN "belegErforderlich" BOOLEAN NOT NULL DEFAULT true;

UPDATE "kostenarten"
SET "belegErforderlich" = false
WHERE trim("name") IN (
  'Nebenkosten des Geldverkehrs',
  'Mahngebühren',
  'Verzugszinsen',
  'Mietminderung',
  'Sonstige Einnahmen (Waschgeld)'
);
