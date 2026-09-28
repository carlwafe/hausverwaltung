-- AlterEnum
ALTER TYPE "KautionEinbehaltStatus" ADD VALUE 'VERRECHNET';

-- AlterTable
ALTER TABLE "kaution_einbehalte" ADD COLUMN "virtuelleAuszahlungId" TEXT;
