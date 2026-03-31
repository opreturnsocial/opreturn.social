import {
  ORS_MAGIC,
  ORS_VERSION_V0,
  ORS_VERSION_V1,
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  MAX_CONTENT_BYTES,
  PUBKEY_BYTES,
  PARENT_TXID_BYTES,
  SIG_BYTES,
  SIG_OFFSET,
  KIND_OFFSET,
  V1_CHUNK0_DATA,
  V1_CHUNKN_DATA,
} from "./types.js";
import { concatBytes } from "./helpers.js";

/**
 * Build the unsigned payload for a TEXT_NOTE — everything that gets hashed and signed.
 * Format: ORS\x00 + pubkey(32) + kind(1) + content_bytes  (no sig)
 */
export function buildUnsignedPayload(
  content: string,
  pubkey: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }

  const contentBytes = new TextEncoder().encode(content);
  if (contentBytes.length > MAX_CONTENT_BYTES) {
    throw new Error(
      `Content too long: ${contentBytes.length} bytes (max ${MAX_CONTENT_BYTES})`,
    );
  }

  // SIG_OFFSET (36) = magic(3) + version(1) + pubkey(32)
  // kind: 1 byte
  // content: raw bytes
  const buf = new Uint8Array(SIG_OFFSET + 1 + contentBytes.length);
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  // kind byte at offset 36 of unsigned (= offset 100 of full payload)
  buf[pos++] = KIND_TEXT_NOTE;

  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build the unsigned payload for a PROFILE_UPDATE — everything that gets hashed and signed.
 * Format: ORS\x00 + pubkey(32) + kind(1=0x02) + propertyKind(1) + value_bytes  (no sig)
 */
export function buildProfileUpdateUnsignedPayload(
  propertyKind: number,
  value: string | Uint8Array,
  pubkey: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }

  const valueBytes =
    value instanceof Uint8Array ? value : new TextEncoder().encode(value);

  // SIG_OFFSET (36) = magic(3) + version(1) + pubkey(32)
  // kind: 1 byte
  // propertyKind: 1 byte
  // value: raw bytes
  const buf = new Uint8Array(SIG_OFFSET + 1 + 1 + valueBytes.length);
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  // kind byte at offset 36 of unsigned (= offset 100 of full payload)
  buf[pos++] = KIND_PROFILE_UPDATE;

  buf[pos++] = propertyKind;
  buf.set(valueBytes, pos);

  return buf;
}

/**
 * Build the unsigned payload for a TEXT_REPLY — everything that gets hashed and signed.
 * Format: ORS\x00 + pubkey(32) + kind(1=0x03) + parentTxid(32) + content_bytes  (no sig)
 */
export function buildReplyUnsignedPayload(
  content: string,
  pubkey: Uint8Array,
  parentTxidBytes: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }
  if (parentTxidBytes.length !== PARENT_TXID_BYTES) {
    throw new Error(`parentTxid must be ${PARENT_TXID_BYTES} bytes`);
  }

  const contentBytes = new TextEncoder().encode(content);
  if (contentBytes.length > MAX_CONTENT_BYTES) {
    throw new Error(
      `Content too long: ${contentBytes.length} bytes (max ${MAX_CONTENT_BYTES})`,
    );
  }

  const buf = new Uint8Array(
    SIG_OFFSET + 1 + PARENT_TXID_BYTES + contentBytes.length,
  );
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  buf[pos++] = KIND_TEXT_REPLY;

  buf.set(parentTxidBytes, pos);
  pos += PARENT_TXID_BYTES;
  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build a complete ORS OP_RETURN payload for a TEXT_REPLY.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1=0x03) + parentTxid(32) + content_bytes
 */
export function buildReplyPayload(
  content: string,
  pubkey: Uint8Array,
  sig: Uint8Array,
  parentTxidBytes: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildReplyUnsignedPayload(content, pubkey, parentTxidBytes);

  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}

/**
 * Build the unsigned payload for a REPOST.
 * Format: ORS\x00 + pubkey(32) + kind(1=0x04) + referencedTxid(32)  (no sig)
 */
export function buildRepostUnsignedPayload(
  pubkey: Uint8Array,
  referencedTxidBytes: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }
  if (referencedTxidBytes.length !== PARENT_TXID_BYTES) {
    throw new Error(`referencedTxid must be ${PARENT_TXID_BYTES} bytes`);
  }

  const buf = new Uint8Array(SIG_OFFSET + 1 + PARENT_TXID_BYTES);
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  buf[pos++] = KIND_REPOST;

  buf.set(referencedTxidBytes, pos);

  return buf;
}

/**
 * Build a complete ORS OP_RETURN payload for a REPOST.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1=0x04) + referencedTxid(32)
 */
export function buildRepostPayload(
  pubkey: Uint8Array,
  sig: Uint8Array,
  referencedTxidBytes: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildRepostUnsignedPayload(pubkey, referencedTxidBytes);

  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}

/**
 * Build the unsigned payload for a QUOTE_REPOST.
 * Format: ORS\x00 + pubkey(32) + kind(1=0x05) + referencedTxid(32) + content_bytes  (no sig)
 */
export function buildQuoteRepostUnsignedPayload(
  content: string,
  pubkey: Uint8Array,
  referencedTxidBytes: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }
  if (referencedTxidBytes.length !== PARENT_TXID_BYTES) {
    throw new Error(`referencedTxid must be ${PARENT_TXID_BYTES} bytes`);
  }

  const contentBytes = new TextEncoder().encode(content);
  if (contentBytes.length > MAX_CONTENT_BYTES) {
    throw new Error(
      `Content too long: ${contentBytes.length} bytes (max ${MAX_CONTENT_BYTES})`,
    );
  }

  const buf = new Uint8Array(
    SIG_OFFSET + 1 + PARENT_TXID_BYTES + contentBytes.length,
  );
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  buf[pos++] = KIND_QUOTE_REPOST;

  buf.set(referencedTxidBytes, pos);
  pos += PARENT_TXID_BYTES;
  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build a complete ORS OP_RETURN payload for a QUOTE_REPOST.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1=0x05) + referencedTxid(32) + content_bytes
 */
export function buildQuoteRepostPayload(
  content: string,
  pubkey: Uint8Array,
  sig: Uint8Array,
  referencedTxidBytes: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildQuoteRepostUnsignedPayload(
    content,
    pubkey,
    referencedTxidBytes,
  );

  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}

/**
 * Build the unsigned payload for a FOLLOW.
 * Format: ORS\x00 + pubkey(32) + kind(1=0x06) + targetPubkey(32) + action(1)
 */
export function buildFollowUnsignedPayload(
  targetPubkey: Uint8Array,
  isFollow: boolean,
  pubkey: Uint8Array,
): Uint8Array {
  if (pubkey.length !== PUBKEY_BYTES) {
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  }
  if (targetPubkey.length !== PUBKEY_BYTES) {
    throw new Error(`targetPubkey must be ${PUBKEY_BYTES} bytes`);
  }

  const buf = new Uint8Array(SIG_OFFSET + 1 + PUBKEY_BYTES + 1);
  let pos = 0;

  buf.set(ORS_MAGIC, pos);
  pos += 3;
  buf[pos++] = ORS_VERSION_V0;

  buf.set(pubkey, pos);
  pos += PUBKEY_BYTES;

  buf[pos++] = KIND_FOLLOW;

  buf.set(targetPubkey, pos);
  pos += PUBKEY_BYTES;
  buf[pos] = isFollow ? 0x01 : 0x00;

  return buf;
}

/**
 * Build a complete ORS OP_RETURN payload for a FOLLOW.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1=0x06) + targetPubkey(32) + action(1)
 */
export function buildFollowPayload(
  targetPubkey: Uint8Array,
  isFollow: boolean,
  pubkey: Uint8Array,
  sig: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildFollowUnsignedPayload(targetPubkey, isFollow, pubkey);

  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}

/**
 * Extract the unsigned bytes from a full on-chain payload (for verification).
 * Removes the 64-byte sig at offset SIG_OFFSET..KIND_OFFSET.
 */
export function getUnsignedBytes(fullPayload: Uint8Array): Uint8Array {
  return concatBytes(
    fullPayload.subarray(0, SIG_OFFSET),
    fullPayload.subarray(KIND_OFFSET),
  );
}

/**
 * Build a complete ORS OP_RETURN payload for a TEXT_NOTE.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1) + content_bytes
 */
export function buildORSPayload(
  content: string,
  pubkey: Uint8Array,
  sig: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildUnsignedPayload(content, pubkey);

  // Insert sig between header (SIG_OFFSET) and kind+data
  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}

// ─── v1 (chunked 80-byte OP_RETURN) ─────────────────────────────────────────

/**
 * Build the v1 signing body: pubkey(32) + kind(1) + kind_data.
 * This is what gets sha256-hashed and Schnorr-signed for v1 posts.
 * No magic or version prefix — saves bytes in the signing scope.
 */
export function buildV1SigningBody(
  pubkey: Uint8Array,
  kind: number,
  kindData: Uint8Array,
): Uint8Array {
  const buf = new Uint8Array(PUBKEY_BYTES + 1 + kindData.length);
  buf.set(pubkey, 0);
  buf[PUBKEY_BYTES] = kind;
  buf.set(kindData, PUBKEY_BYTES + 1);
  return buf;
}

/**
 * Split a v1 body across 80-byte OP_RETURN chunks.
 *
 * body = pubkey(32) + sig(64) + kind(1) + kind_data
 *
 * Chunk 0: ORS(3) | 0x01(1) | 0x00(1) | totalChunks(1) | body[0:74]   — 80 bytes max
 * Chunk N: ORS(3) | 0x01(1) | N(1)    | body[74+(N-1)*75:74+N*75]     — 80 bytes max
 *
 * Returns an array of OP_RETURN payloads (without OP_RETURN opcode), each <= 80 bytes.
 */
export function buildV1Chunks(
  pubkey: Uint8Array,
  sig: Uint8Array,
  kind: number,
  kindData: Uint8Array,
): Uint8Array[] {
  if (pubkey.length !== PUBKEY_BYTES)
    throw new Error(`pubkey must be ${PUBKEY_BYTES} bytes`);
  if (sig.length !== SIG_BYTES)
    throw new Error(`sig must be ${SIG_BYTES} bytes`);

  const body = concatBytes(pubkey, sig, new Uint8Array([kind]), kindData);

  const numNonRootChunks = Math.ceil(
    Math.max(0, body.length - V1_CHUNK0_DATA) / V1_CHUNKN_DATA,
  );
  const totalChunks = 1 + numNonRootChunks;

  const chunks: Uint8Array[] = [];

  // Chunk 0
  const chunk0Body = body.subarray(0, V1_CHUNK0_DATA);
  const chunk0 = new Uint8Array(6 + chunk0Body.length);
  chunk0.set(ORS_MAGIC, 0);
  chunk0[3] = ORS_VERSION_V1;
  chunk0[4] = 0x00;
  chunk0[5] = totalChunks;
  chunk0.set(chunk0Body, 6);
  chunks.push(chunk0);

  // Chunks 1..N
  for (let n = 1; n < totalChunks; n++) {
    const start = V1_CHUNK0_DATA + (n - 1) * V1_CHUNKN_DATA;
    const end = Math.min(start + V1_CHUNKN_DATA, body.length);
    const slice = body.subarray(start, end);
    const chunk = new Uint8Array(5 + slice.length);
    chunk.set(ORS_MAGIC, 0);
    chunk[3] = ORS_VERSION_V1;
    chunk[4] = n;
    chunk.set(slice, 5);
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Build a complete ORS OP_RETURN payload for a PROFILE_UPDATE.
 * Format: ORS\x00 + pubkey(32) + sig(64) + kind(1=0x02) + propertyKind(1) + value_bytes
 */
export function buildProfileUpdatePayload(
  propertyKind: number,
  value: string | Uint8Array,
  pubkey: Uint8Array,
  sig: Uint8Array,
): Uint8Array {
  if (sig.length !== SIG_BYTES) {
    throw new Error(`sig must be ${SIG_BYTES} bytes`);
  }

  const unsigned = buildProfileUpdateUnsignedPayload(
    propertyKind,
    value,
    pubkey,
  );

  const buf = new Uint8Array(unsigned.length + SIG_BYTES);
  buf.set(unsigned.subarray(0, SIG_OFFSET), 0);
  buf.set(sig, SIG_OFFSET);
  buf.set(unsigned.subarray(SIG_OFFSET), KIND_OFFSET);

  return buf;
}
