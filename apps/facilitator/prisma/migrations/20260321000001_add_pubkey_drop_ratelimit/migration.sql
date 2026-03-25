-- Add pubkey column to PendingBroadcast for rate-limit queries
ALTER TABLE "PendingBroadcast" ADD COLUMN "pubkey" TEXT NOT NULL DEFAULT '';

-- Drop RateLimit table (rate limiting uses PendingBroadcast directly)
DROP TABLE IF EXISTS "RateLimit";
