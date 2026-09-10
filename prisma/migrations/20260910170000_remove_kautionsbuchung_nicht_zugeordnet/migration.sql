-- Entfernt den Platzhalter-Wert NICHT_ZUGEORDNET aus KautionBuchungKategorie: alle 53
-- Altbuchungen wurden inzwischen manuell auf eine echte Kategorie gesetzt, der Platzhalter wird
-- nicht mehr gebraucht. Postgres kennt kein ALTER TYPE ... DROP VALUE, daher wird der Enum-Typ
-- neu angelegt und die Spalte umgehängt — sicher, weil vorher geprüft wurde, dass keine Zeile
-- mehr NICHT_ZUGEORDNET trägt (jeder verbleibende Wert existiert unverändert im neuen Typ).

-- AlterTable: Default entfernen, bevor der alte Typ verschwindet
ALTER TABLE "kautionsbuchungen" ALTER COLUMN "kategorie" DROP DEFAULT;

-- Enum-Typ neu anlegen ohne NICHT_ZUGEORDNET
ALTER TYPE "KautionBuchungKategorie" RENAME TO "KautionBuchungKategorie_old";

CREATE TYPE "KautionBuchungKategorie" AS ENUM ('EINZAHLUNG_MIETER', 'ANLAGE', 'AUFLOESUNG', 'AUSZAHLUNG_MIETER', 'SONSTIGES');

ALTER TABLE "kautionsbuchungen"
  ALTER COLUMN "kategorie" TYPE "KautionBuchungKategorie"
  USING ("kategorie"::text::"KautionBuchungKategorie");

DROP TYPE "KautionBuchungKategorie_old";
