-- Backfill for a schema gap: the previous two migrations (add_eigentuemerbuchung,
-- add_kautionbuchung) were no-ops, because on the original development database these tables
-- already existed from an earlier, since-reverted schema. A genuinely fresh database (e.g. a
-- new production database) never got a real CREATE TABLE for either, so this migration creates
-- them if missing, guarded so it stays a no-op wherever they already exist.

DO $$
BEGIN
  IF to_regclass('public.eigentuemerbuchungen') IS NULL THEN
    CREATE TABLE public.eigentuemerbuchungen (
        id text NOT NULL,
        datum timestamp(3) without time zone NOT NULL,
        betrag numeric(10,2) NOT NULL,
        empfaenger text,
        verwendungszweck text,
        rohdaten jsonb,
        "importBatchId" text,
        "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT eigentuemerbuchungen_pkey PRIMARY KEY (id)
    );

    ALTER TABLE public.eigentuemerbuchungen
        ADD CONSTRAINT "eigentuemerbuchungen_importBatchId_fkey"
        FOREIGN KEY ("importBatchId") REFERENCES public.import_batches(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.kautionsbuchungen') IS NULL THEN
    CREATE TABLE public.kautionsbuchungen (
        id text NOT NULL,
        "mietvertragId" text,
        datum timestamp(3) without time zone NOT NULL,
        betrag numeric(10,2) NOT NULL,
        empfaenger text,
        verwendungszweck text,
        rohdaten jsonb,
        "importBatchId" text,
        "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT kautionsbuchungen_pkey PRIMARY KEY (id)
    );

    CREATE INDEX "kautionsbuchungen_mietvertragId_idx" ON public.kautionsbuchungen USING btree ("mietvertragId");

    ALTER TABLE public.kautionsbuchungen
        ADD CONSTRAINT "kautionsbuchungen_importBatchId_fkey"
        FOREIGN KEY ("importBatchId") REFERENCES public.import_batches(id)
        ON UPDATE CASCADE ON DELETE SET NULL;

    ALTER TABLE public.kautionsbuchungen
        ADD CONSTRAINT "kautionsbuchungen_mietvertragId_fkey"
        FOREIGN KEY ("mietvertragId") REFERENCES public.mietvertraege(id)
        ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
