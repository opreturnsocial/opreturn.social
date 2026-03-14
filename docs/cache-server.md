# Cache Server - Post Lifecycle & Status Tracking

## Status Lifecycle

Posts, follows, and profile updates move through statuses as they are broadcast and confirmed on-chain.

```
[/notify] --> pending
pending + found in block --> confirmed    (block scanner)
pending + not in mempool --> evicted      (mempool eviction check)
confirmed + re-org detected --> pending   (re-org check; tx goes back to mempool)
```

### Statuses

| Status      | Meaning                                                                  |
|-------------|--------------------------------------------------------------------------|
| `pending`   | Broadcast to mempool, not yet confirmed in a block                       |
| `confirmed` | Included in a block that the scanner has processed                       |
| `evicted`   | Removed from mempool without confirmation (double-spend, RBF, expiry)    |

### Per-model behavior

- **Post / Follow**: all three statuses apply. `evicted` records are kept in the DB (anti-spam / audit trail) but hidden from all public API responses.
- **Profile**: only `pending` and `confirmed`. If a profile update tx is evicted, the profile retains whatever data was written and status reverts to `confirmed` (the scanner does not track profile txids separately).

## Re-org Handling

The scanner stores the block hash for each processed height in `ScannedBlock`. On every scan cycle it checks the last 6 blocks for hash mismatches.

When a re-org is detected at height H:
1. `ScannedBlock` records from H onward are deleted.
2. All confirmed `Post` and `Follow` records with `blockHeight >= H` revert to `status: "pending"` and `blockHeight: 0`.
3. `ScannerState.lastBlock` is reset to H - 1.
4. Bitcoin Core automatically returns re-orged transactions to the mempool, so the eviction check will subsequently find them still in the mempool (they stay `pending`) or evict them if they were dropped.

## Mempool Eviction Check

On every scan cycle (after re-org check), the scanner calls `getmempoolentry` for each `pending` Post and Follow. If the call throws (tx not in mempool), the record is marked `evicted`.

## API Behavior

- `GET /posts` - excludes `evicted` (returns `pending` + `confirmed`)
- `GET /posts/:txid/replies` - excludes `evicted`
- `GET /og` - `confirmed` only (pending posts do not count toward OG leaderboard)
- `GET /follows/:pubkey` - returns `{ pubkeys, pendingPubkeys }` where `pubkeys` is all non-evicted follows and `pendingPubkeys` is the subset that is `pending`
- `GET /followers/:pubkey` - excludes `evicted`
- `GET /profiles` - includes `status` field

## Frontend Pending Indicators

- **Post card**: clock icon when `blockHeight === 0` (already implemented)
- **Follow button**: shows "Following (pending)" when the follow is in `pendingPubkeys`
- **Edit Profile modal**: shows "Awaiting block confirmation" note when `profile.status === "pending"`
