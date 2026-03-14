-- CreateTable
CREATE TABLE "Follow" (
    "followerPubkey" TEXT NOT NULL,
    "followeePubkey" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "isFollow" BOOLEAN NOT NULL,

    PRIMARY KEY ("followerPubkey", "followeePubkey")
);
