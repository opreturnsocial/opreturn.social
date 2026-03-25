-- Add network field to PendingBroadcast (defaults to 'mainnet')
ALTER TABLE "PendingBroadcast" ADD COLUMN "network" TEXT NOT NULL DEFAULT 'mainnet';

-- Add pubkey field for efficient rate-limit queries (defaults to empty for old rows)
ALTER TABLE "PendingBroadcast" ADD COLUMN "pubkey" TEXT NOT NULL DEFAULT '';
