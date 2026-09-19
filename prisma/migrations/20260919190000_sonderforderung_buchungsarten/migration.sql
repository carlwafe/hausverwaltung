-- Sonderforderungen an Mieter (z.B. Rücklastschriftgebühr): MAHNGEBUEHR ist die Forderung
-- (Sollstellung auf dem Mietkonto, kein Geldfluss, nach Zuflussprinzip nicht eur-relevant),
-- SONDERZAHLUNG der spätere Zahlungseingang dazu (Geldfluss, eur-relevant).
INSERT INTO "buchungsarten" ("id", "code", "bezeichnung", "kontokreis", "zahlungswirksam", "eurRelevant")
VALUES
  ('ba_mahngebuehr', 'MAHNGEBUEHR', 'Gebühr an Mieter berechnet (Sonderforderung)', 'MIETKONTO', false, false),
  ('ba_sonderzahlung', 'SONDERZAHLUNG', 'Zahlung des Mieters auf Gebühren (Sonderforderung)', 'MIETKONTO', true, true)
ON CONFLICT ("code") DO NOTHING;
