-- Tickets können privat sein: dann sieht sie nur der Ersteller.
ALTER TABLE "tickets" ADD COLUMN "privat" BOOLEAN NOT NULL DEFAULT false;
