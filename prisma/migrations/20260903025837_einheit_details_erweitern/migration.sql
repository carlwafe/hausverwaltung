-- AlterTable
ALTER TABLE "einheiten" ADD COLUMN     "einbaukueche" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fotosVorhanden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notizen" TEXT;

