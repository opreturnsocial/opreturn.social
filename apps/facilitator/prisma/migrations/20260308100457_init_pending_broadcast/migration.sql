-- CreateTable
CREATE TABLE "PendingBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentHash" TEXT NOT NULL,
    "preimage" TEXT NOT NULL,
    "invoice" TEXT NOT NULL,
    "signedTxHex" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "feeSats" INTEGER NOT NULL,
    "invoiceSats" INTEGER NOT NULL,
    "broadcast" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "action" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingBroadcast_paymentHash_key" ON "PendingBroadcast"("paymentHash");
