-- CreateEnum
CREATE TYPE "Anrede" AS ENUM ('FRAU', 'HERR');

-- AlterTable
ALTER TABLE "mieter" ADD COLUMN "anrede" "Anrede";
