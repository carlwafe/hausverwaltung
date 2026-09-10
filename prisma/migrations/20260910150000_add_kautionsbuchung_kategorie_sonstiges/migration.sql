-- Fünfte Kategorie für Kautionsbuchungen, die zu keiner der vier echten Kategorien passen (z.B.
-- eine Korrekturbuchung für eine versehentliche Doppelüberweisung) — bewusst abgeschlossen,
-- anders als NICHT_ZUGEORDNET.

-- AlterEnum
ALTER TYPE "KautionBuchungKategorie" ADD VALUE 'SONSTIGES';
