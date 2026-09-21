-- Vom Kontoauszug abgelesene Kontostände als Kontrollpunkte für den simulierten Kontostand.
CREATE TABLE "kontostand_kontrollen" (
    "id" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aktualisiertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kontostand_kontrollen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kontostand_kontrollen_datum_key" ON "kontostand_kontrollen"("datum");
