-- Verwaltungswechsel je Dienstleister: Datum der Information über die neue Verwaltung bzw. der
-- Kündigung des Vertrags der alten Verwaltung. Nullable ohne Default, ändert keine Bestandsdaten.
ALTER TABLE "dienstleister" ADD COLUMN "verwaltungInformiertAm" TIMESTAMP(3);
ALTER TABLE "dienstleister" ADD COLUMN "vertragGekuendigtAm" TIMESTAMP(3);
