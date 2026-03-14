/*
  Warnings:

  - Added the required column `pubkey` to the `Post` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sig` to the `Post` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "txid" TEXT NOT NULL PRIMARY KEY,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "kind" INTEGER NOT NULL DEFAULT 1,
    "pubkey" TEXT NOT NULL,
    "sig" TEXT NOT NULL
);
INSERT INTO "new_Post" ("blockHeight", "content", "kind", "timestamp", "txid") SELECT "blockHeight", "content", "kind", "timestamp", "txid" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
