-- Truncate dependent tables before schema change
TRUNCATE TABLE "players" CASCADE;
TRUNCATE TABLE "teams" CASCADE;

-- Drop old unique constraint on (name, era_id)
DROP INDEX IF EXISTS "teams_name_era_id_key";

-- Drop foreign key and era_id column
ALTER TABLE "teams" DROP CONSTRAINT IF EXISTS "teams_era_id_fkey";
ALTER TABLE "teams" DROP COLUMN IF EXISTS "era_id";

-- Add unique constraint on name only
ALTER TABLE "teams" ADD CONSTRAINT "teams_name_key" UNIQUE ("name");
