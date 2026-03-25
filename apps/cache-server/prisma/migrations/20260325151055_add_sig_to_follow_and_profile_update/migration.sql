/*
  Warnings:

  - You are about to alter the column `isFollow` on the `Follow` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.

*/
-- DropIndex
DROP INDEX "PendingChunk_txid_key";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Follow" (
    "followerPubkey" TEXT NOT NULL,
    "followeePubkey" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "txid" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "isFollow" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "sig" TEXT NOT NULL DEFAULT '',

    PRIMARY KEY ("followerPubkey", "followeePubkey", "network")
);
INSERT INTO "new_Follow" ("blockHeight", "followeePubkey", "followerPubkey", "isFollow", "network", "status", "timestamp", "txid") SELECT "blockHeight", "followeePubkey", "followerPubkey", "isFollow", "network", "status", "timestamp", "txid" FROM "Follow";
DROP TABLE "Follow";
ALTER TABLE "new_Follow" RENAME TO "Follow";
CREATE TABLE "new_ProfileUpdateEvent" (
    "txid" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "pubkey" TEXT NOT NULL,
    "propertyKind" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "sig" TEXT NOT NULL DEFAULT '',

    PRIMARY KEY ("txid", "network")
);
INSERT INTO "new_ProfileUpdateEvent" ("blockHeight", "network", "propertyKind", "pubkey", "status", "timestamp", "txid", "value") SELECT "blockHeight", "network", "propertyKind", "pubkey", "status", "timestamp", "txid", "value" FROM "ProfileUpdateEvent";
DROP TABLE "ProfileUpdateEvent";
ALTER TABLE "new_ProfileUpdateEvent" RENAME TO "ProfileUpdateEvent";
CREATE TABLE "new_ScannerState" (
    "network" TEXT NOT NULL PRIMARY KEY,
    "lastBlock" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_ScannerState" ("lastBlock", "network") SELECT "lastBlock", "network" FROM "ScannerState";
DROP TABLE "ScannerState";
ALTER TABLE "new_ScannerState" RENAME TO "ScannerState";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
