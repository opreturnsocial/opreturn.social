-- Migration: add network field to all tables, update primary keys for multi-network support
-- SQLite requires table recreation for primary key changes.

-- Post: txid @id -> @@id([txid, network])
CREATE TABLE "Post_new" (
    "txid"        TEXT    NOT NULL,
    "network"     TEXT    NOT NULL DEFAULT 'mainnet',
    "blockHeight" INTEGER NOT NULL,
    "timestamp"   INTEGER NOT NULL,
    "content"     TEXT    NOT NULL,
    "kind"        INTEGER NOT NULL DEFAULT 1,
    "pubkey"      TEXT    NOT NULL,
    "sig"         TEXT    NOT NULL,
    "parentTxid"  TEXT,
    "status"      TEXT    NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY ("txid", "network")
);
INSERT INTO "Post_new" SELECT "txid", 'mainnet', "blockHeight", "timestamp", "content", "kind", "pubkey", "sig", "parentTxid", "status" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "Post_new" RENAME TO "Post";

-- ScannerState: id Int @id -> network String @id
CREATE TABLE "ScannerState_new" (
    "network"   TEXT    NOT NULL PRIMARY KEY DEFAULT 'mainnet',
    "lastBlock" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "ScannerState_new" SELECT 'mainnet', "lastBlock" FROM "ScannerState";
DROP TABLE "ScannerState";
ALTER TABLE "ScannerState_new" RENAME TO "ScannerState";

-- Profile: pubkey @id -> @@id([pubkey, network])
CREATE TABLE "Profile_new" (
    "pubkey"    TEXT    NOT NULL,
    "network"   TEXT    NOT NULL DEFAULT 'mainnet',
    "name"      TEXT,
    "bio"       TEXT,
    "avatarUrl" TEXT,
    "status"    TEXT    NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY ("pubkey", "network")
);
INSERT INTO "Profile_new" SELECT "pubkey", 'mainnet', "name", "bio", "avatarUrl", "status" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "Profile_new" RENAME TO "Profile";

-- Follow: @@id([followerPubkey, followeePubkey]) -> @@id([followerPubkey, followeePubkey, network])
CREATE TABLE "Follow_new" (
    "followerPubkey" TEXT    NOT NULL,
    "followeePubkey" TEXT    NOT NULL,
    "network"        TEXT    NOT NULL DEFAULT 'mainnet',
    "txid"           TEXT    NOT NULL,
    "timestamp"      INTEGER NOT NULL,
    "blockHeight"    INTEGER NOT NULL,
    "isFollow"       INTEGER NOT NULL,
    "status"         TEXT    NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY ("followerPubkey", "followeePubkey", "network")
);
INSERT INTO "Follow_new" SELECT "followerPubkey", "followeePubkey", 'mainnet', "txid", "timestamp", "blockHeight", "isFollow", "status" FROM "Follow";
DROP TABLE "Follow";
ALTER TABLE "Follow_new" RENAME TO "Follow";

-- ProfileUpdateEvent: txid @id -> @@id([txid, network])
CREATE TABLE "ProfileUpdateEvent_new" (
    "txid"         TEXT    NOT NULL,
    "network"      TEXT    NOT NULL DEFAULT 'mainnet',
    "pubkey"       TEXT    NOT NULL,
    "propertyKind" INTEGER NOT NULL,
    "value"        TEXT    NOT NULL,
    "blockHeight"  INTEGER NOT NULL,
    "timestamp"    INTEGER NOT NULL,
    "status"       TEXT    NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY ("txid", "network")
);
INSERT INTO "ProfileUpdateEvent_new" SELECT "txid", 'mainnet', "pubkey", "propertyKind", "value", "blockHeight", "timestamp", "status" FROM "ProfileUpdateEvent";
DROP TABLE "ProfileUpdateEvent";
ALTER TABLE "ProfileUpdateEvent_new" RENAME TO "ProfileUpdateEvent";

-- ScannedBlock: height @id -> @@id([height, network])
CREATE TABLE "ScannedBlock_new" (
    "height"  INTEGER NOT NULL,
    "network" TEXT    NOT NULL DEFAULT 'mainnet',
    "hash"    TEXT    NOT NULL,
    PRIMARY KEY ("height", "network")
);
INSERT INTO "ScannedBlock_new" SELECT "height", 'mainnet', "hash" FROM "ScannedBlock";
DROP TABLE "ScannedBlock";
ALTER TABLE "ScannedBlock_new" RENAME TO "ScannedBlock";

-- PendingChunk: keep id @id, change txid @unique -> @@unique([txid, network])
ALTER TABLE "PendingChunk" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'mainnet';
CREATE UNIQUE INDEX "PendingChunk_txid_network_key" ON "PendingChunk"("txid", "network");
