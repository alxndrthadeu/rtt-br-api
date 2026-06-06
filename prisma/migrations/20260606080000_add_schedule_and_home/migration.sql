-- Add schedule (JSON) to games so the API can store the 38-round calendar
ALTER TABLE "games" ADD COLUMN "schedule" JSONB;

-- Add is_home to matches to track home/away context
ALTER TABLE "matches" ADD COLUMN "is_home" BOOLEAN NOT NULL DEFAULT false;
