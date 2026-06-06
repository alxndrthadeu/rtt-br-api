CREATE TABLE "team_era_stats" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "team" TEXT NOT NULL,
  "era" TEXT NOT NULL,
  "atk_ovr" INTEGER NOT NULL,
  "def_ovr" INTEGER NOT NULL,
  CONSTRAINT "team_era_stats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_era_stats_team_era_key" UNIQUE ("team", "era")
);
