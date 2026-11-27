-- Vertragsstatus wird aus Beginn und Mietende abgeleitet (src/lib/vertragsstatus.ts); die Spalte ist
-- seit dem vorherigen Deploy ungenutzt. Zweiter Schritt, damit die alte Version die Spalte nicht mehr abfragt.
ALTER TABLE "mietvertraege" DROP COLUMN "status";
DROP TYPE "MietvertragStatus";
