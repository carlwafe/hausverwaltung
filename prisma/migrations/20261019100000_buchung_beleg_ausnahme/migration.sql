-- „Kein Beleg nötig“ je Kostenposition (Belegprüfung der Nebenkostenabrechnung); eigene Tabelle, weil
-- Buchungen unveränderlich sind. Neue Tabelle, ändert keine Bestandsdaten.

-- CreateTable
CREATE TABLE "buchung_beleg_ausnahmen" (
    "id" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "grund" TEXT NOT NULL,
    "gesetztVon" TEXT,
    "gesetztAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buchung_beleg_ausnahmen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "buchung_beleg_ausnahmen_buchungId_key" ON "buchung_beleg_ausnahmen"("buchungId");

-- AddForeignKey
ALTER TABLE "buchung_beleg_ausnahmen" ADD CONSTRAINT "buchung_beleg_ausnahmen_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
