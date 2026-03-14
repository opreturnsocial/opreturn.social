-- CreateTable
CREATE TABLE "PendingChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "txid" TEXT NOT NULL,
    "chunkNum" INTEGER NOT NULL,
    "totalChunks" INTEGER,
    "bodySlice" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingChunk_txid_key" ON "PendingChunk"("txid");
