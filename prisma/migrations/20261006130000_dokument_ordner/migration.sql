-- Ordnername für allgemeine Dokumente ohne Bezug (Versicherung, Grundbuch, Steuer …).
-- Dokumente mit Bezug (Mietvertrag, Einheit, Kosten, Dienstleister, Ticket) ordnen sich
-- automatisch nach ihrem Bezug ein und brauchen die Spalte nicht.
ALTER TABLE "dokumente" ADD COLUMN "ordner" TEXT;
