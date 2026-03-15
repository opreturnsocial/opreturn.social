-- CreateTable
CREATE TABLE "ProfileUpdateEvent" (
    "txid" TEXT NOT NULL PRIMARY KEY,
    "pubkey" TEXT NOT NULL,
    "propertyKind" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed'
);
