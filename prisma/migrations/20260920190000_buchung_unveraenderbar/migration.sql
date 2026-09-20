-- GoBD/Artefakt (Abschnitt 8): das Buchungsjournal ist unveränderlich. Die Anwendung storniert
-- statt zu ändern oder zu löschen (storniereBuchung); dieser Trigger erzwingt das auch auf
-- Datenbankebene, damit ein Ad-hoc-SQL-Fix ("schnell einen Tippfehler korrigieren") nicht
-- stillschweigend die Historie verändert.
--
-- Erlaubt bleiben nur reine Verweis-Änderungen, die die Anwendung bzw. Fremdschlüssel-Aktionen
-- selbst durchführen:
--   * storniertDurchBuchungId: NULL -> Wert (Storno-Verknüpfung)
--   * bezugTyp/bezugId: NULL -> Wert (Verknüpfung, z.B. virtuelle Kaution-Gegenbuchung)
--   * mietvertragId/gebaeudeId/hausId/kostengruppeId/einheitId/importBatchId: Wert -> NULL
--     (ON DELETE SET NULL, wenn z.B. ein Mietvertrag oder Import gelöscht wird)
-- Jede andere Änderung und jedes DELETE/TRUNCATE wird abgewiesen.
--
-- Bewusste Korrektur per SQL (Ausnahmefall): Trigger vorher explizit abschalten und danach
-- wieder einschalten:
--   ALTER TABLE "buchungen" DISABLE TRIGGER buchungen_unveraenderbar;
--   ... Korrektur ...
--   ALTER TABLE "buchungen" ENABLE TRIGGER buchungen_unveraenderbar;

CREATE OR REPLACE FUNCTION buchungen_unveraenderbar_pruefen() RETURNS trigger AS $$
DECLARE
  verweis_spalten text[] := ARRAY[
    'storniertDurchBuchungId', 'bezugTyp', 'bezugId',
    'mietvertragId', 'gebaeudeId', 'hausId', 'kostengruppeId', 'einheitId', 'importBatchId'
  ];
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Buchungen sind unveränderlich (GoBD) und dürfen nicht gelöscht werden — stattdessen stornieren.';
  END IF;

  -- Alles außer den Verweis-Spalten muss identisch bleiben.
  IF (to_jsonb(NEW) - verweis_spalten) IS DISTINCT FROM (to_jsonb(OLD) - verweis_spalten) THEN
    RAISE EXCEPTION 'Buchungen sind unveränderlich (GoBD) — Änderungen nur per Storno und Neuanlage.';
  END IF;

  -- Verweis-Spalten dürfen nur in der jeweils erlaubten Richtung wechseln.
  IF NEW."storniertDurchBuchungId" IS DISTINCT FROM OLD."storniertDurchBuchungId"
     AND OLD."storniertDurchBuchungId" IS NOT NULL THEN
    RAISE EXCEPTION 'Eine stornierte Buchung darf nicht erneut verändert werden.';
  END IF;
  IF (NEW."bezugTyp" IS DISTINCT FROM OLD."bezugTyp" OR NEW."bezugId" IS DISTINCT FROM OLD."bezugId")
     AND (OLD."bezugTyp" IS NOT NULL OR OLD."bezugId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Ein bestehender Bezug einer Buchung darf nicht überschrieben werden.';
  END IF;
  IF (NEW."mietvertragId" IS DISTINCT FROM OLD."mietvertragId" AND NEW."mietvertragId" IS NOT NULL)
     OR (NEW."gebaeudeId" IS DISTINCT FROM OLD."gebaeudeId" AND NEW."gebaeudeId" IS NOT NULL)
     OR (NEW."hausId" IS DISTINCT FROM OLD."hausId" AND NEW."hausId" IS NOT NULL)
     OR (NEW."kostengruppeId" IS DISTINCT FROM OLD."kostengruppeId" AND NEW."kostengruppeId" IS NOT NULL)
     OR (NEW."einheitId" IS DISTINCT FROM OLD."einheitId" AND NEW."einheitId" IS NOT NULL)
     OR (NEW."importBatchId" IS DISTINCT FROM OLD."importBatchId" AND NEW."importBatchId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Zuordnungen einer Buchung dürfen nur entfallen (z.B. durch Löschen des Bezugsobjekts), nicht umgehängt werden.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER buchungen_unveraenderbar
  BEFORE UPDATE OR DELETE ON "buchungen"
  FOR EACH ROW EXECUTE FUNCTION buchungen_unveraenderbar_pruefen();

CREATE TRIGGER buchungen_unveraenderbar_truncate
  BEFORE TRUNCATE ON "buchungen"
  FOR EACH STATEMENT EXECUTE FUNCTION buchungen_unveraenderbar_pruefen();
