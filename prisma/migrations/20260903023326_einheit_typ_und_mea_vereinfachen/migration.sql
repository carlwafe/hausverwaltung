
-- AlterEnum
BEGIN;
CREATE TYPE "EinheitTyp_new" AS ENUM ('WOHNUNG', 'GARAGE');
ALTER TABLE "public"."einheiten" ALTER COLUMN "typ" DROP DEFAULT;
ALTER TABLE "einheiten" ALTER COLUMN "typ" TYPE "EinheitTyp_new" USING ("typ"::text::"EinheitTyp_new");
ALTER TYPE "EinheitTyp" RENAME TO "EinheitTyp_old";
ALTER TYPE "EinheitTyp_new" RENAME TO "EinheitTyp";
DROP TYPE "public"."EinheitTyp_old";
ALTER TABLE "einheiten" ALTER COLUMN "typ" SET DEFAULT 'WOHNUNG';
COMMIT;

-- AlterTable
ALTER TABLE "einheiten" DROP COLUMN "miteigentumsanteil";

