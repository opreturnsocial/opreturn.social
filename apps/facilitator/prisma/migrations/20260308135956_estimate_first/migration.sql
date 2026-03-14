/*
  Warnings:

  - You are about to drop the column `feeSats` on the `PendingBroadcast` table. All the data in the column will be lost.
  - You are about to drop the column `signedTxHex` on the `PendingBroadcast` table. All the data in the column will be lost.
  - Added the required column `estimatedFeeSats` to the `PendingBroadcast` table without a default value. This is not possible if the table is not empty.
  - Added the required column `feeRateBtcPerKb` to the `PendingBroadcast` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payloadHex` to the `PendingBroadcast` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PendingBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentHash" TEXT NOT NULL,
    "preimage" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "payloadHex" TEXT NOT NULL,
    "estimatedFeeSats" INTEGER NOT NULL,
    "feeRateBtcPerKb" REAL NOT NULL,
    "txid" TEXT,
    "invoiceSats" INTEGER NOT NULL,
    "broadcast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "action" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL
);
INSERT INTO "new_PendingBroadcast" ("action", "broadcast", "createdAt", "expiresAt", "id", "invoice", "invoiceSats", "paymentHash", "preimage", "requestJson", "txid") SELECT "action", "broadcast", "createdAt", "expiresAt", "id", "invoice", "invoiceSats", "paymentHash", "preimage", "requestJson", "txid" FROM "PendingBroadcast";
DROP TABLE "PendingBroadcast";
ALTER TABLE "new_PendingBroadcast" RENAME TO "PendingBroadcast";
CREATE UNIQUE INDEX "PendingBroadcast_paymentHash_key" ON "PendingBroadcast"("paymentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
