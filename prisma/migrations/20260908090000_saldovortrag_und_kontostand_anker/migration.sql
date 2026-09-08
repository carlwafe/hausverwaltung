ALTER TABLE "mietvertraege" ADD COLUMN "saldovortrag" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "objekte" ADD COLUMN "kontostandAnkerDatum" TIMESTAMP(3);
ALTER TABLE "objekte" ADD COLUMN "kontostandAnkerBetrag" DECIMAL(10,2);
