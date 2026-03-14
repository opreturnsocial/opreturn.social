# Architecture

## Overview

A minimal social protocol where posts are embedded directly in bitcoin OP_RETURN outputs.
Each post is funded by the facilitator and paid for via Lightning (NWC/WebLN hold invoice).
No batching, no intermediate trust - every post is an on-chain bitcoin transaction.

---

## Diagram

```
┌─────────────────┐      HTTP GET       ┌─────────────────┐
│  Web Frontend   │ ──────────────────→ │  Cache Server   │
│  React + Vite   │                     │  (REST API)     │
│  shadcn/ui      │                     │  - stores posts │
└────────┬────────┘                     │  - serves feed  │
         │                              └────────┬────────┘
         │ POST {content, pubkey, sig}            │ polls Bitcoin
         │ pays invoice (NWC/WebLN)               │ node every 5s
         │ polls /status/:paymentHash             │
         ↓                                        ↓
┌─────────────────┐                     ┌─────────────────┐
│   Facilitator   │                     │  Bitcoin Node   │
│  (Node.js API)  │ ──────────────────→ │  (Polar/regtest)│
│  - verify sig   │    broadcast tx     │                 │
│  - hold invoice │                     └─────────────────┘
│  - build+bcast  │
│  - settle LN    │
└─────────────────┘
         ↑
         │ NWC subscription
         │ hold_invoice_accepted → auto-broadcast
         ↓
┌─────────────────┐
│  NWC Wallet     │
│  (NWC_URL env)  │
└─────────────────┘
```

---

## Components

### 1. Cache Server (`apps/cache-server/`)

- **Port:** 3001
- **Storage:** SQLite via Prisma
- **API Endpoints:**
  - `GET /posts` - List all posts, newest first
  - `GET /posts/:txid` - Single post by txid
  - `GET /posts/:txid/replies` - Reply thread for a post
  - `GET /profiles/:pubkey` - User profile (latest PROFILE_UPDATE)
  - `GET /follows?pubkey=...` - Follow graph for a pubkey
  - `POST /notify` - Internal: facilitator tells cache "new tx seen" (protected by `X-Internal-Token`)
  - `POST /rescan` - Internal: trigger blockchain rescan from a block height (protected by `X-Internal-Token`)
- **Internal auth:** Both `/notify` and `/rescan` require header `X-Internal-Token: <CACHE_INTERNAL_TOKEN>`. Env var `CACHE_INTERNAL_TOKEN` must match in both cache-server and facilitator. Fails closed (rejects all) if env var is unset.
- **Background job:** Polls bitcoin node every 5s for new blocks, extracts OP_RETURN, decodes ORS payloads

**Why a cache?** Parsing raw blockchain in the browser is impractical. Cache provides fast reads while maintaining verifiability (anyone can rescan and verify).

### 2. Facilitator Server (`apps/facilitator/`)

- **Port:** 3002
- **Endpoints:** `GET /health`, `GET /fee-rate`, `POST /post`, `POST /reply`, `POST /repost`, `POST /quote-repost`, `POST /follow`, `POST /profile`
- **Payment flow (all write endpoints) - estimate-first, no UTXO locking:**
  1. Verify Schnorr signature
  2. Build ORS payload hex (pure function, no RPC)
  3. `estimatesmartfee(1)` → feeRate (BTC/kB); if `FORCE_FEE_RATE_SAT_PER_VBYTE` env var is set, use that instead (bypasses Core's estimator - useful on regtest)
  4. `estimatedFeeSats = ceil((121 + payloadBytes) * feeRate * 1e5)` (vSize formula)
  5. Calculate invoice amount: `ceil(estimatedFeeSats * (1 + FEE_MARKUP_PERCENT / 100))`
  6. Generate random preimage + SHA256 payment hash
  7. Create hold invoice via NWC (`NWC_URL`)
  8. Store `{ paymentHash, preimage, invoice, payloadHex, estimatedFeeSats, feeRateBtcPerKb, invoiceSats, action, requestJson }` in SQLite
  9. Return `{ invoice, paymentHash, feeSats: estimatedFeeSats, invoiceSats }` - do NOT broadcast yet
- **Auto-broadcast via NWC subscription:**
  - Facilitator subscribes to NWC notifications
  - On `hold_invoice_accepted` event: enqueue build+broadcast for that paymentHash (serialised promise queue)
  - `createrawtransaction` → `fundrawtransactionwithrate(feeRateBtcPerKb)` → `signrawtransactionwithwallet` → `sendrawtransaction`
  - On broadcast failure: `lockunspent(true, vin)` to unlock, `cancelHoldInvoice`, rethrow
  - On success: mark `broadcast = true`, store `txid`, `settleHoldInvoice(preimage)`, notify cache
- **Serialisation:** In-process promise queue ensures two concurrent confirms pick up change UTXOs correctly
- **`GET /status/:paymentHash`** - Frontend polls this (1s interval) until `broadcast: true`, then shows txid toast
- **Bitcoin RPC:** Connects to Polar/regtest node (Bitcoin Core 30+)
- **Lightning:** NWC connection (`NWC_URL` env var) - facilitator is the payment receiver

### 3. Web Frontend (`apps/frontend/`)

- **Port:** 5173 (Vite dev server)
- **Libraries:** React + Vite + shadcn/ui + tailwindcss
- **Views:**
  - Feed: Scrollable list of posts (newest first)
  - Post button: Opens modal with 140-char input
  - Profile pages, reply threads, follow graph
- **Signing:**
  ```javascript
  // Nostr key via Alby extension
  const sig = await window.nostr.signSchnorr(msgHex); // msgHex = sha256(content_utf8)
  // Or local key via @noble/curves
  const sig = schnorr.sign(msgHex, privateKeyBytes);
  ```
- **Payment:** `src/lib/payment.ts` - tries NWC (`ors_nwc_url` in localStorage), falls back to `window.webln`
- **Build:** Signs sha256(unsignedPayload) with Schnorr, POSTs `{ content, pubkey, sig }` to facilitator

---

## Protocol Specification

See [ORS](https://github.com/opreturnsocial/ors) base protocol and [ORSK](https://github.com/opreturnsocial/orsk) kinds registry.

### ORS Wire Formats

**v0 (single OP_RETURN):**
```
ORS\x00 + pubkey(32) + sig(64) + kind(1) + kind_data
```
Minimum 102 bytes. Most miners reject payloads >80 bytes.
Signing: `sha256(ORS\x00 || pubkey || kind || kind_data)`

**v1 (chunked 80-byte OP_RETURN):**
```
Chunk 0: ORS(3) | 0x01(1) | 0x00(1) | total_chunks(1) | body[0:74]   (80 bytes max)
Chunk N: ORS(3) | 0x01(1) | N(1)    | body[74+(N-1)*75:74+N*75]      (80 bytes max)
body = pubkey(32) + sig(64) + kind(1) + kind_data
```
Signing: `sha256(pubkey || kind || kind_data)` (no magic prefix)
Canonical post id = chunk 0 txid. Each chunk is a separate bitcoin transaction.

### Fee Formula (v1)

```
totalVSize = sum(121 + chunkPayloadBytes for each chunk)
feeSats    = ceil(totalVSize * feeRateBtcPerKb * 1e5)
```

Example (140-char ASCII post, 3 chunks): 3 × (121 + 80) = 603 vbytes.

### Protocol Version Selection

Frontend reads `localStorage.ors_protocol_version` (default `"1"`). All write requests include `protocolVersion` field. Facilitator defaults to `1` if not specified.

### Post Kinds

| Hex  | Name           | Description                        |
|------|----------------|------------------------------------|
| 0x01 | TEXT_NOTE      | Plain text post                    |
| 0x02 | PROFILE_UPDATE | Update display name, bio, etc.     |
| 0x03 | TEXT_REPLY     | Reply to another post (by txid)    |
| 0x04 | REPOST         | Repost another post (by txid)      |
| 0x05 | QUOTE_REPOST   | Quote repost with comment          |
| 0x06 | FOLLOW         | Follow a pubkey                    |

### JSON Structure (stored in cache)

```json
{
  "txid": "abc123...",
  "blockHeight": 12345,
  "timestamp": 1700000000,
  "content": "Hello bitcoin!",
  "kind": 1,
  "pubkey": "...(32-byte hex)...",
  "sig": "...(64-byte hex)...",
  "parentTxid": null,
  "status": "confirmed"
}
```

---

## Data Flow: Creating a Post

1. User types message in frontend modal (140 char limit)
2. Frontend signs `sha256(content_utf8)` with Schnorr via `window.nostr.signSchnorr(msgHex)` or local key
3. Frontend POSTs `{ content, pubkey, sig }` to facilitator `/post`
4. Facilitator verifies sig, builds payload hex, estimates fee (no UTXO locking), creates hold invoice, stores in DB
5. Facilitator returns `{ invoice, paymentHash, feeSats, invoiceSats }`
6. Frontend pays invoice via NWC or `window.webln`
7. Facilitator NWC subscription receives `hold_invoice_accepted` event, auto-queues broadcast
8. Facilitator builds + broadcasts tx (serialised queue), settles invoice, notifies cache
9. Frontend polls `GET /status/:paymentHash` every 1s until `broadcast: true`
10. Frontend shows success toast with txid; cache picks up new post in next 5s poll

---

## File Structure

```
ors-mvp/
├── docs/
│   ├── architecture.md                  # This file
│   ├── cache-server.md                # Caching specifics
│   ├── DEPLOY.md                # Deployment instructions
├── packages/
│   └── protocol/                # @ors/protocol - TLV encode/decode, zero deps
│       ├── src/
│       └── package.json
└── apps/
    ├── cache-server/            # Express + Prisma/SQLite, port 3001
    │   ├── src/
    │   ├── prisma/schema.prisma
    │   └── package.json
    ├── facilitator/             # Express + Prisma/SQLite, port 3002
    │   ├── src/
    │   ├── prisma/schema.prisma
    │   └── package.json
    └── frontend/                # React + Vite + shadcn/ui, port 5173
        ├── src/
        ├── index.html
        └── package.json
```

---

## Dependencies

**Global for Polar testing:**

- Polar (Bitcoin Core + LND nodes in Docker)
- Node.js 18+, Yarn

**Cache Server:**

- `express`, `cors`, `dotenv`
- `@prisma/client` (SQLite)
- `tiny-secp256k1` (Schnorr verify)
- `@ors/protocol` (TLV decode)

**Facilitator:**

- `express`, `cors`, `dotenv`
- `@prisma/client` (SQLite)
- `@getalby/sdk` (NWC client - hold invoices, subscriptions)
- `tiny-secp256k1` (Schnorr verify)
- `@ors/protocol` (TLV encode)

**Frontend:**

- `react`, `react-dom`, `react-router-dom`
- `@getalby/sdk` (NWC payment)
- `@noble/curves`, `@noble/hashes` (local Schnorr signing)
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `@radix-ui/react-alert-dialog`
- `lucide-react`, `sonner` (icons, toasts)
- `tailwindcss`, `vite`

---

## Testing

### Setup

1. Start Polar with 1 Bitcoin Core 30+ node (large OP_RETURN supported natively - no `datacarriersize` config needed)
2. Mine 101 blocks (mature coinbase)
3. Copy `.env.example` to `.env` in each app, fill in RPC creds and `NWC_URL`
4. Run `yarn db:generate` and `yarn db:migrate` in both `apps/cache-server` and `apps/facilitator`
5. Start all services: `yarn dev:cache`, `yarn dev:facilitator`, `yarn dev:frontend`

### Post flow test

1. Open frontend at `http://localhost:5173`
2. Connect NWC wallet (settings modal, paste NWC URL)
3. Click Post, type message, submit
4. Observe: invoice paid → auto-broadcast → txid toast → post appears in feed
