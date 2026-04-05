-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipientPubkey" TEXT NOT NULL,
    "actorPubkey" TEXT NOT NULL,
    "kind" INTEGER NOT NULL,
    "txid" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'mainnet',
    "timestamp" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "Notification_recipientPubkey_network_timestamp_idx" ON "Notification"("recipientPubkey", "network", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Notification_recipientPubkey_timestamp_idx" ON "Notification"("recipientPubkey", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_txid_network_key" ON "Notification"("txid", "network");
