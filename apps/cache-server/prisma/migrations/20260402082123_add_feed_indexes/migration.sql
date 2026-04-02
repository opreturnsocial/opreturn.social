-- CreateIndex
CREATE INDEX "Follow_network_status_timestamp_idx" ON "Follow"("network", "status", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Follow_followerPubkey_network_status_idx" ON "Follow"("followerPubkey", "network", "status");

-- CreateIndex
CREATE INDEX "Post_network_status_timestamp_idx" ON "Post"("network", "status", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Post_sig_network_status_idx" ON "Post"("sig", "network", "status");

-- CreateIndex
CREATE INDEX "Post_pubkey_network_status_idx" ON "Post"("pubkey", "network", "status");

-- CreateIndex
CREATE INDEX "ProfileUpdateEvent_network_status_timestamp_idx" ON "ProfileUpdateEvent"("network", "status", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ProfileUpdateEvent_sig_network_status_idx" ON "ProfileUpdateEvent"("sig", "network", "status");

-- CreateIndex
CREATE INDEX "ProfileUpdateEvent_pubkey_network_status_idx" ON "ProfileUpdateEvent"("pubkey", "network", "status");
