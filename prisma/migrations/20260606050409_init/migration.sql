-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "era" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "pos_principal" TEXT NOT NULL,
    "pos_sec1" TEXT,
    "pos_sec2" TEXT,
    "estilo" TEXT NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "player_uuid" TEXT NOT NULL,
    "formation" TEXT NOT NULL,
    "rerolls_used" INTEGER NOT NULL DEFAULT 0,
    "ranking" TEXT,
    "pts" INTEGER,
    "v" INTEGER,
    "e" INTEGER,
    "d" INTEGER,
    "gf" INTEGER,
    "gc" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "slot_pos" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL,
    "opp_team" TEXT NOT NULL,
    "opp_era" TEXT NOT NULL,
    "opp_ovr" INTEGER NOT NULL,
    "my_goals" INTEGER NOT NULL,
    "opp_goals" INTEGER NOT NULL,
    "result" TEXT NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rankings" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "destaque_player_id" TEXT NOT NULL,
    "destaque_overall" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rankings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rankings_game_id_key" ON "rankings"("game_id");

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rankings" ADD CONSTRAINT "rankings_destaque_player_id_fkey" FOREIGN KEY ("destaque_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
