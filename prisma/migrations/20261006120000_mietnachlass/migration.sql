-- Einmaliger Nachlass auf die Kaltmiete eines Monats (z.B. späterer Einzug im Einzugsmonat).
CREATE TABLE "mietnachlaesse" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "monat" INTEGER NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "grund" TEXT NOT NULL,
    "erstelltVon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mietnachlaesse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mietnachlaesse_mietvertragId_jahr_monat_idx" ON "mietnachlaesse"("mietvertragId", "jahr", "monat");

ALTER TABLE "mietnachlaesse" ADD CONSTRAINT "mietnachlaesse_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;
