/**
 * Browser-native ORS protocol helpers (mirrors @ors/protocol without Node.js deps).
 * Format: ORS\x00 + pubkey(32) + kind(1) + kind-specific data  — no sig slot
 */

export const MAX_CONTENT_BYTES = 277;

// ORS\x00
const MAGIC = new Uint8Array([0x4f, 0x52, 0x53, 0x00]);

export function getProtocolVersion(): number {
  return parseInt(localStorage.getItem("ors_protocol_version") ?? "1", 10);
}

/**
 * Build the v1 signing body from a v0 unsigned payload.
 * v0 unsigned = MAGIC(4) + pubkey(32) + kind(1) + kind_data
 * v1 signing  = pubkey(32) + kind(1) + kind_data  (strip 4-byte MAGIC prefix)
 */
export function buildV1SigningBody(v0Unsigned: Uint8Array): Uint8Array {
  return v0Unsigned.subarray(4);
}

/**
 * Compute the number of v1 chunks for a given body byte count.
 * body = pubkey(32) + sig(64) + kind(1) + kindData
 */
export function v1ChunkCount(kindDataBytes: number): number {
  const bodyLen = 97 + kindDataBytes; // pubkey(32) + sig(64) + kind(1)
  return 1 + Math.ceil(Math.max(0, bodyLen - 74) / 75);
}

/**
 * Estimate v0 total vBytes for fee display (single OP_RETURN tx).
 * v0 OP_RETURN data = MAGIC(4) + pubkey(32) + sig(64) + kind(1) + kindData
 */
export function v0EstimatedVBytes(kindDataBytes: number): number {
  return 223 + kindDataBytes;
}

/**
 * Version-aware vBytes estimator. Pass kindDataBytes for the specific action.
 */
export function estimatedVBytes(kindDataBytes: number, version: number): number {
  return version === 0 ? v0EstimatedVBytes(kindDataBytes) : v1EstimatedVBytes(kindDataBytes);
}

/**
 * Estimate v1 total vBytes for fee display.
 */
export function v1EstimatedVBytes(kindDataBytes: number): number {
  const bodyLen = 97 + kindDataBytes; // pubkey(32) + sig(64) + kind(1)

  // Chunk 0: 6-byte header + up to 74 body bytes
  const chunk0Payload = 6 + Math.min(74, bodyLen);
  let totalVBytes = 121 + chunk0Payload;

  // Subsequent chunks: 5-byte header + up to 75 body bytes each
  let remaining = bodyLen - 74;
  while (remaining > 0) {
    const slice = Math.min(75, remaining);
    totalVBytes += 121 + 5 + slice;
    remaining -= slice;
  }

  return totalVBytes;
}

export const KIND_TEXT_NOTE = 0x01;
export const KIND_PROFILE_UPDATE = 0x02;
export const KIND_TEXT_REPLY = 0x03;
export const KIND_REPOST = 0x04;
export const KIND_QUOTE_REPOST = 0x05;
export const KIND_FOLLOW = 0x06;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Build the unsigned payload for a TEXT_NOTE.
 * magic(4) + pubkey(32) + kind(1) + content_bytes
 */
export function buildUnsignedPayload(content: string, pubkeyHex: string): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const contentBytes = new TextEncoder().encode(content);
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + contentBytes.length));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  // kind byte at offset 36 of unsigned (= offset 100 of full payload)
  buf[pos++] = KIND_TEXT_NOTE;

  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build the unsigned payload for a TEXT_REPLY.
 * magic(4) + pubkey(32) + kind(1=0x03) + parentTxid(32) + content_bytes
 */
export function buildReplyUnsignedPayload(
  content: string,
  pubkeyHex: string,
  parentTxidHex: string
): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const parentTxid = hexToBytes(parentTxidHex);
  const contentBytes = new TextEncoder().encode(content);
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + 32 + contentBytes.length));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  buf[pos++] = KIND_TEXT_REPLY;

  buf.set(parentTxid, pos); pos += 32;
  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build the unsigned payload for a REPOST.
 * magic(4) + pubkey(32) + kind(1=0x04) + referencedTxid(32)
 */
export function buildRepostUnsignedPayload(
  pubkeyHex: string,
  referencedTxidHex: string
): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const referencedTxid = hexToBytes(referencedTxidHex);
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + 32));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  buf[pos++] = KIND_REPOST;

  buf.set(referencedTxid, pos);

  return buf;
}

/**
 * Build the unsigned payload for a QUOTE_REPOST.
 * magic(4) + pubkey(32) + kind(1=0x05) + referencedTxid(32) + content_bytes
 */
export function buildQuoteRepostUnsignedPayload(
  content: string,
  pubkeyHex: string,
  referencedTxidHex: string
): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const referencedTxid = hexToBytes(referencedTxidHex);
  const contentBytes = new TextEncoder().encode(content);
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + 32 + contentBytes.length));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  buf[pos++] = KIND_QUOTE_REPOST;

  buf.set(referencedTxid, pos); pos += 32;
  buf.set(contentBytes, pos);

  return buf;
}

/**
 * Build the unsigned payload for a FOLLOW.
 * magic(4) + pubkey(32) + kind(1=0x06) + targetPubkey(32) + action(1)
 */
export function buildFollowUnsignedPayload(
  targetPubkeyHex: string,
  isFollow: boolean,
  pubkeyHex: string
): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const targetPubkey = hexToBytes(targetPubkeyHex);
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + 32 + 1));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  buf[pos++] = KIND_FOLLOW;

  buf.set(targetPubkey, pos); pos += 32;
  buf[pos] = isFollow ? 0x01 : 0x00;

  return buf;
}

/**
 * Build the unsigned payload for a PROFILE_UPDATE.
 * magic(4) + pubkey(32) + kind(1=0x02) + propertyKind(1) + value_bytes
 */
export function buildProfileUpdateUnsignedPayload(
  propertyKind: number,
  value: Uint8Array | string,
  pubkeyHex: string
): Uint8Array<ArrayBuffer> {
  const pubkey = hexToBytes(pubkeyHex);
  const valueBytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const buf = new Uint8Array(new ArrayBuffer(4 + 32 + 1 + 1 + valueBytes.length));
  let pos = 0;

  buf.set(MAGIC, pos); pos += 4;
  buf.set(pubkey, pos); pos += 32;

  // kind byte
  buf[pos++] = KIND_PROFILE_UPDATE;

  buf[pos++] = propertyKind;
  buf.set(valueBytes, pos);

  return buf;
}
