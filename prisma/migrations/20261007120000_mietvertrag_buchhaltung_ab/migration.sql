-- Eigener Buchhaltungs-Stichtag je Mietvertrag; leer (NULL) = es gilt Objekt.buchhaltungAb.
-- Nullable ohne Default, ändert keine Bestandsdaten.
ALTER TABLE "mietvertraege" ADD COLUMN "buchhaltungAb" TIMESTAMP(3);
