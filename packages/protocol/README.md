# @opreturnsocial/protocol

Zero-dependency TypeScript library for encoding and decoding the ORS (OP_RETURN Social) bitcoin social protocol.

## Installation

```bash
npm install @opreturnsocial/protocol
# or
yarn add @opreturnsocial/protocol
```

## Overview

ORS embeds social interactions (posts, replies, reposts, follows, profile updates) directly into bitcoin OP_RETURN outputs. This library handles the binary serialization and deserialization of those payloads.

- Zero production dependencies
- Works in browsers and Node.js (no `Buffer` dependency)
- Dual CJS/ESM exports
- Supports both v0 (single OP_RETURN) and v1 (chunked 80-byte OP_RETURN) formats
- Does not perform signing - only builds unsigned payloads and assembles signed ones

## Protocol Versions

### v0 - Single OP_RETURN

All data fits in one OP_RETURN output. Maximum content size is 277 bytes.

```
[ORS magic (3)] [version 0x00 (1)] [pubkey (32)] [sig (64)] [kind (1)] [kind data ...]
```

### v1 - Chunked OP_RETURN

Data is split across multiple 80-byte OP_RETURN outputs, enabling larger payloads and a smaller signing scope.

```
Chunk 0:  [ORS (3)] [0x01 (1)] [0x00 (1)] [totalChunks (1)] [body bytes 0..73]
Chunk N:  [ORS (3)] [0x01 (1)] [N (1)]                       [body bytes ...]
```

Signing body for v1: `sha256(pubkey || kind || kindData)` (no magic prefix)

## API Reference

### Helpers

```typescript
hexToBytes(hex: string): Uint8Array
bytesToHex(bytes: Uint8Array): string
concatBytes(...bufs: Uint8Array[]): Uint8Array
equalBytes(a: Uint8Array, b: Uint8Array): boolean
```

### Constants

#### Post Kinds

| Constant | Value | Description |
|---|---|---|
| `KIND_TEXT_NOTE` | `0x01` | Plain text post |
| `KIND_PROFILE_UPDATE` | `0x02` | Profile field update |
| `KIND_TEXT_REPLY` | `0x03` | Reply to another post |
| `KIND_REPOST` | `0x04` | Repost |
| `KIND_QUOTE_REPOST` | `0x05` | Quote repost with comment |
| `KIND_FOLLOW` | `0x06` | Follow or unfollow |

#### Profile Properties

| Constant | Value | Description |
|---|---|---|
| `PROFILE_PROPERTY_NAME` | `0x00` | Display name |
| `PROFILE_PROPERTY_AVATAR_URL` | `0x01` | Avatar image URL |
| `PROFILE_PROPERTY_BIO` | `0x02` | Biography |
| `PROFILE_PROPERTY_BANNER_URL` | `0x03` | Banner image URL |
| `PROFILE_PROPERTY_BOT` | `0x04` | Bot flag |
| `PROFILE_PROPERTY_WEBSITE_URL` | `0x05` | Website URL |

#### Other

- `ORS_MAGIC` - magic bytes `ORS` (0x4F, 0x52, 0x53)
- `ORS_VERSION` / `ORS_VERSION_V1` - version bytes
- `PUBKEY_BYTES` (32), `SIG_BYTES` (64), `PARENT_TXID_BYTES` (32), `MAX_CONTENT_BYTES` (277)

### Types

```typescript
interface OrsPost {
  kind: number;
  content: string;
  pubkey: string;  // 32-byte hex
  sig: string;     // 64-byte hex
}

interface OrsProfileUpdate {
  kind: 0x02;
  propertyKind: number;
  content: string;
  pubkey: string;
  sig: string;
}

interface OrsTextReply {
  kind: 0x03;
  parentTxid: string;  // 32-byte hex
  content: string;
  pubkey: string;
  sig: string;
}

interface OrsRepost {
  kind: 0x04;
  referencedTxid: string;  // 32-byte hex
  pubkey: string;
  sig: string;
}

interface OrsQuoteRepost {
  kind: 0x05;
  referencedTxid: string;  // 32-byte hex
  content: string;
  pubkey: string;
  sig: string;
}

interface OrsFollow {
  kind: 0x06;
  targetPubkey: string;  // 32-byte hex
  isFollow: boolean;
  pubkey: string;
  sig: string;
}

type ParsedOrsResult =
  | { supported: true; post: OrsPost | OrsProfileUpdate | OrsTextReply | OrsRepost | OrsQuoteRepost | OrsFollow }
  | { supported: false; reason: string };
```

### Encoding

#### Unsigned payload builders (for signing)

```typescript
buildUnsignedPayload(content: string, pubkey: Uint8Array): Uint8Array
buildProfileUpdateUnsignedPayload(propertyKind: number, value: string | Uint8Array, pubkey: Uint8Array): Uint8Array
buildReplyUnsignedPayload(content: string, pubkey: Uint8Array, parentTxidBytes: Uint8Array): Uint8Array
buildRepostUnsignedPayload(pubkey: Uint8Array, referencedTxidBytes: Uint8Array): Uint8Array
buildQuoteRepostUnsignedPayload(content: string, pubkey: Uint8Array, referencedTxidBytes: Uint8Array): Uint8Array
buildFollowUnsignedPayload(targetPubkey: Uint8Array, isFollow: boolean, pubkey: Uint8Array): Uint8Array
```

#### Full payload builders (with signature)

```typescript
buildORSPayload(content: string, pubkey: Uint8Array, sig: Uint8Array): Uint8Array
buildProfileUpdatePayload(propertyKind: number, value: string | Uint8Array, pubkey: Uint8Array, sig: Uint8Array): Uint8Array
buildReplyPayload(content: string, pubkey: Uint8Array, sig: Uint8Array, parentTxidBytes: Uint8Array): Uint8Array
buildRepostPayload(pubkey: Uint8Array, sig: Uint8Array, referencedTxidBytes: Uint8Array): Uint8Array
buildQuoteRepostPayload(content: string, pubkey: Uint8Array, sig: Uint8Array, referencedTxidBytes: Uint8Array): Uint8Array
buildFollowPayload(targetPubkey: Uint8Array, isFollow: boolean, pubkey: Uint8Array, sig: Uint8Array): Uint8Array
```

#### Utilities

```typescript
// Extract the unsigned portion from a signed payload (strips the signature)
getUnsignedBytes(fullPayload: Uint8Array): Uint8Array

// Build v1 signing body: sha256(pubkey || kind || kindData)
buildV1SigningBody(pubkey: Uint8Array, kind: number, kindData: Uint8Array): Uint8Array

// Split a body into 80-byte v1 chunks
buildV1Chunks(pubkey: Uint8Array, sig: Uint8Array, kind: number, kindData: Uint8Array): Uint8Array[]
```

### Decoding

```typescript
// Parse a v0 ORS payload from an OP_RETURN output
parseORSPayload(data: Uint8Array): ParsedOrsResult

// Parse a single v1 chunk
parseV1Chunk(data: Uint8Array): V1ChunkInfo | null

interface V1ChunkInfo {
  chunkNum: number;
  totalChunks?: number;  // only present on chunk 0
  bodySlice: Uint8Array;
}

// Reassemble v1 body slices into a decoded post
assembleV1Body(slices: Uint8Array[]): {
  pubkey: Uint8Array;
  sig: Uint8Array;
  kind: number;
  kindData: Uint8Array;
} | null
```

## Usage Examples

### Text post

```typescript
import { buildUnsignedPayload, buildORSPayload, hexToBytes, bytesToHex } from '@opreturnsocial/protocol';
import { schnorr } from '@noble/curves/secp256k1';

const privkey = hexToBytes('your-32-byte-privkey-hex');
const pubkey = schnorr.getPublicKey(privkey);

// Build unsigned bytes, sign, then build full payload
const unsigned = buildUnsignedPayload('Hello bitcoin!', pubkey);
const sig = schnorr.sign(unsigned, privkey);
const payload = buildORSPayload('Hello bitcoin!', pubkey, sig);
// payload is the OP_RETURN data for your bitcoin transaction
console.log(bytesToHex(payload));
```

### Reply

```typescript
import { buildReplyUnsignedPayload, buildReplyPayload, hexToBytes } from '@opreturnsocial/protocol';

const parentTxid = hexToBytes('parent-txid-hex');
const unsigned = buildReplyUnsignedPayload('Great post!', pubkey, parentTxid);
const sig = schnorr.sign(unsigned, privkey);
const payload = buildReplyPayload('Great post!', pubkey, sig, parentTxid);
```

### Repost

```typescript
import { buildRepostUnsignedPayload, buildRepostPayload, hexToBytes } from '@opreturnsocial/protocol';

const referencedTxid = hexToBytes('txid-to-repost-hex');
const unsigned = buildRepostUnsignedPayload(pubkey, referencedTxid);
const sig = schnorr.sign(unsigned, privkey);
const payload = buildRepostPayload(pubkey, sig, referencedTxid);
```

### Follow

```typescript
import { buildFollowUnsignedPayload, buildFollowPayload, hexToBytes } from '@opreturnsocial/protocol';

const targetPubkey = hexToBytes('target-pubkey-hex');
const unsigned = buildFollowUnsignedPayload(targetPubkey, true, pubkey);
const sig = schnorr.sign(unsigned, privkey);
const payload = buildFollowPayload(targetPubkey, true, pubkey, sig);
```

### Profile update

```typescript
import {
  buildProfileUpdateUnsignedPayload,
  buildProfileUpdatePayload,
  PROFILE_PROPERTY_NAME,
} from '@opreturnsocial/protocol';

const unsigned = buildProfileUpdateUnsignedPayload(PROFILE_PROPERTY_NAME, 'Satoshi', pubkey);
const sig = schnorr.sign(unsigned, privkey);
const payload = buildProfileUpdatePayload(PROFILE_PROPERTY_NAME, 'Satoshi', pubkey, sig);
```

### Parsing a received payload

```typescript
import { parseORSPayload } from '@opreturnsocial/protocol';

const result = parseORSPayload(opReturnData);
if (result.supported) {
  const { post } = result;
  console.log(post.kind, post.pubkey);
} else {
  console.log('Unsupported:', result.reason);
}
```

### V1 chunked parsing

```typescript
import { parseV1Chunk, assembleV1Body } from '@opreturnsocial/protocol';

// Collect chunks from multiple OP_RETURN outputs (ordered by chunk number)
const chunks = [chunk0Data, chunk1Data, chunk2Data];
const slices: Uint8Array[] = [];

for (const chunk of chunks) {
  const info = parseV1Chunk(chunk);
  if (info) slices[info.chunkNum] = info.bodySlice;
}

const body = assembleV1Body(slices);
if (body) {
  const { pubkey, sig, kind, kindData } = body;
}
```

## License

MIT
