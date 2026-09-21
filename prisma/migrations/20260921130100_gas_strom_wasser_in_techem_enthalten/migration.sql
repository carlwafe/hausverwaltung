-- Die Techem-Abrechnung pro Mieter enthält Heizung, Wasser, Gas und Strom zusammen: Gas,
-- Allgemeinstrom und Wasser/Abwasser haben daher keine eigene Pro-Mieter-Eingabe, sondern sind in den
-- Heizkosten-Beträgen enthalten. Eigene Migration, weil ein neuer Enum-Wert nicht in derselben
-- Transaktion verwendet werden darf, in der er angelegt wird.
UPDATE "kostenarten"
SET "standardVerteilerschluessel" = 'IN_ABRECHNUNG_ENTHALTEN'
WHERE "name" IN ('Allgemeinstrom', 'Gas', 'Wasser/Abwasser')
  AND "standardVerteilerschluessel" = 'VORVERTEILT';
