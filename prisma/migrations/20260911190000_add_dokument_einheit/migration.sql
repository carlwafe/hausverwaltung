-- AlterTable
ALTER TABLE "dokumente" ADD COLUMN "einheitId" TEXT;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE CASCADE ON UPDATE CASCADE;
