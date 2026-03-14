-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PendingBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentHash" TEXT NOT NULL,
    "preimage" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "payloadHex" TEXT NOT NULL,
    "chunksJson" TEXT,
    "protocolVersion" INTEGER NOT NULL DEFAULT 0,
    "estimatedFeeSats" INTEGER NOT NULL,
    "feeRateBtcPerKb" REAL NOT NULL,
    "txid" TEXT,
    "chunkTxids" TEXT,
    "invoiceSats" INTEGER NOT NULL,
    "broadcast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "action" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL
);
INSERT INTO "new_PendingBroadcast" ("action", "broadcast", "createdAt", "estimatedFeeSats", "expiresAt", "feeRateBtcPerKb", "id", "invoice", "invoiceSats", "payloadHex", "paymentHash", "preimage", "requestJson", "txid") SELECT "action", "broadcast", "createdAt", "estimatedFeeSats", "expiresAt", "feeRateBtcPerKb", "id", "invoice", "invoiceSats", "payloadHex", "paymentHash", "preimage", "requestJson", "txid" FROM "PendingBroadcast";
DROP TABLE "PendingBroadcast";
ALTER TABLE "new_PendingBroadcast" RENAME TO "PendingBroadcast";
CREATE UNIQUE INDEX "PendingBroadcast_paymentHash_key" ON "PendingBroadcast"("paymentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
