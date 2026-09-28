-- CreateEnum
CREATE TYPE "Zahlungsweg" AS ENUM ('LASTSCHRIFT', 'UEBERWEISUNG');

-- AlterTable
ALTER TABLE "mietvertraege" ADD COLUMN "zahlungsweg" "Zahlungsweg";
