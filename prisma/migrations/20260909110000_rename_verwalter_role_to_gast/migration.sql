-- Rename the "VERWALTER" role to "GAST": Verwalter accounts (full write access besides user/
-- objekt management) are replaced by a read-only Gast role. No existing user currently holds
-- VERWALTER, so this is a pure rename with no data impact.
ALTER TYPE "Role" RENAME VALUE 'VERWALTER' TO 'GAST';
