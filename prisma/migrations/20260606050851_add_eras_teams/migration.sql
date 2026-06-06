/*
  Warnings:

  - You are about to drop the column `era` on the `players` table. All the data in the column will be lost.
  - You are about to drop the column `team` on the `players` table. All the data in the column will be lost.
  - Added the required column `era_id` to the `players` table without a default value. This is not possible if the table is not empty.
  - Added the required column `team_id` to the `players` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "players" DROP COLUMN "era",
DROP COLUMN "team",
ADD COLUMN     "era_id" TEXT NOT NULL,
ADD COLUMN     "team_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "eras" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "eras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "era_id" TEXT NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eras_name_key" ON "eras"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_era_id_key" ON "teams"("name", "era_id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_era_id_fkey" FOREIGN KEY ("era_id") REFERENCES "eras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_era_id_fkey" FOREIGN KEY ("era_id") REFERENCES "eras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
