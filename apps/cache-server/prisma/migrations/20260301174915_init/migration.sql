-- CreateTable
CREATE TABLE "Post" (
    "txid" TEXT NOT NULL PRIMARY KEY,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "kind" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "ScannerState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "lastBlock" INTEGER NOT NULL DEFAULT 0
);
