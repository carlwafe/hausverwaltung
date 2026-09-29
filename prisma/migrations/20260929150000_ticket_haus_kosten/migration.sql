-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "hausId" TEXT;

-- CreateTable
CREATE TABLE "ticket_kosten" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "buchungId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_kosten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_kosten_buchungId_idx" ON "ticket_kosten"("buchungId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_kosten_ticketId_buchungId_key" ON "ticket_kosten"("ticketId", "buchungId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "haeuser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_kosten" ADD CONSTRAINT "ticket_kosten_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_kosten" ADD CONSTRAINT "ticket_kosten_buchungId_fkey" FOREIGN KEY ("buchungId") REFERENCES "buchungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
