-- CreateTable
CREATE TABLE "ScannedBlock" (
    "height" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "hash" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Follow" (
    "followerPubkey" TEXT NOT NULL,
    "followeePubkey" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "isFollow" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',

    PRIMARY KEY ("followerPubkey", "followeePubkey")
);
INSERT INTO "new_Follow" ("blockHeight", "followeePubkey", "followerPubkey", "isFollow", "timestamp", "txid") SELECT "blockHeight", "followeePubkey", "followerPubkey", "isFollow", "timestamp", "txid" FROM "Follow";
DROP TABLE "Follow";
ALTER TABLE "new_Follow" RENAME TO "Follow";
CREATE TABLE "new_Post" (
    "txid" TEXT NOT NULL PRIMARY KEY,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "kind" INTEGER NOT NULL DEFAULT 1,
    "pubkey" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    "parentTxid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed'
);
INSERT INTO "new_Post" ("blockHeight", "content", "kind", "parentTxid", "pubkey", "sig", "timestamp", "txid") SELECT "blockHeight", "content", "kind", "parentTxid", "pubkey", "sig", "timestamp", "txid" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE TABLE "new_Profile" (
    "pubkey" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed'
);
INSERT INTO "new_Profile" ("avatarUrl", "bio", "name", "pubkey") SELECT "avatarUrl", "bio", "name", "pubkey" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
