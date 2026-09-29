-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OFFEN', 'IN_BEARBEITUNG', 'WARTET', 'ERLEDIGT');

-- CreateEnum
CREATE TYPE "TicketPrioritaet" AS ENUM ('NIEDRIG', 'NORMAL', 'HOCH', 'DRINGEND');

-- CreateEnum
CREATE TYPE "TicketKategorie" AS ENUM ('MANGEL_REPARATUR', 'MIETERANFRAGE', 'AUFGABE', 'BUCHHALTUNG', 'SONSTIGES');

-- AlterTable
ALTER TABLE "dokumente" ADD COLUMN     "ticketId" TEXT;

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "nummer" SERIAL NOT NULL,
    "titel" TEXT NOT NULL,
    "beschreibung" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OFFEN',
    "prioritaet" "TicketPrioritaet" NOT NULL DEFAULT 'NORMAL',
    "kategorie" "TicketKategorie" NOT NULL DEFAULT 'MANGEL_REPARATUR',
    "faelligAm" TIMESTAMP(3),
    "erledigtAm" TIMESTAMP(3),
    "einheitId" TEXT,
    "gebaeudeId" TEXT,
    "mietvertragId" TEXT,
    "dienstleisterId" TEXT,
    "erstelltVonId" TEXT,
    "zugewiesenAnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_kommentare" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "autor" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_kommentare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_nummer_key" ON "tickets"("nummer");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "ticket_kommentare_ticketId_idx" ON "ticket_kommentare"("ticketId");

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_gebaeudeId_fkey" FOREIGN KEY ("gebaeudeId") REFERENCES "gebaeude"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_dienstleisterId_fkey" FOREIGN KEY ("dienstleisterId") REFERENCES "dienstleister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_erstelltVonId_fkey" FOREIGN KEY ("erstelltVonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_zugewiesenAnId_fkey" FOREIGN KEY ("zugewiesenAnId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_kommentare" ADD CONSTRAINT "ticket_kommentare_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
