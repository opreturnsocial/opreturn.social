import {
  buildUnsignedPayload as _buildUnsignedPayload,
  buildReplyUnsignedPayload as _buildReplyUnsignedPayload,
  buildRepostUnsignedPayload as _buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload as _buildQuoteRepostUnsignedPayload,
  buildFollowUnsignedPayload as _buildFollowUnsignedPayload,
  buildProfileUpdateUnsignedPayload as _buildProfileUpdateUnsignedPayload,
  hexToBytes,
} from "@opreturnsocial/protocol";

export {
  MAX_CONTENT_BYTES,
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROFILE_PROPERTY_NAME,
  PROFILE_PROPERTY_AVATAR_URL,
  PROFILE_PROPERTY_BIO,
  PROFILE_PROPERTY_BANNER_URL,
  PROFILE_PROPERTY_BOT,
  PROFILE_PROPERTY_WEBSITE_URL,
} from "@opreturnsocial/protocol";

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

/**
 * Version-aware vBytes estimator. Pass kindDataBytes for the specific action.
 */
export function estimatedVBytes(
  kindDataBytes: number,
  version: number,
): number {
  return version === 0
    ? v0EstimatedVBytes(kindDataBytes)
    : v1EstimatedVBytes(kindDataBytes);
}

// Wrappers that accept hex strings to match existing call-site API

export function buildUnsignedPayload(
  content: string,
  pubkeyHex: string,
): Uint8Array {
  return _buildUnsignedPayload(content, hexToBytes(pubkeyHex));
}

export function buildReplyUnsignedPayload(
  content: string,
  pubkeyHex: string,
  parentTxidHex: string,
): Uint8Array {
  return _buildReplyUnsignedPayload(
    content,
    hexToBytes(pubkeyHex),
    hexToBytes(parentTxidHex),
  );
}

export function buildRepostUnsignedPayload(
  pubkeyHex: string,
  referencedTxidHex: string,
): Uint8Array {
  return _buildRepostUnsignedPayload(
    hexToBytes(pubkeyHex),
    hexToBytes(referencedTxidHex),
  );
}

export function buildQuoteRepostUnsignedPayload(
  content: string,
  pubkeyHex: string,
  referencedTxidHex: string,
): Uint8Array {
  return _buildQuoteRepostUnsignedPayload(
    content,
    hexToBytes(pubkeyHex),
    hexToBytes(referencedTxidHex),
  );
}

export function buildFollowUnsignedPayload(
  targetPubkeyHex: string,
  isFollow: boolean,
  pubkeyHex: string,
): Uint8Array {
  return _buildFollowUnsignedPayload(
    hexToBytes(targetPubkeyHex),
    isFollow,
    hexToBytes(pubkeyHex),
  );
}

export function buildProfileUpdateUnsignedPayload(
  propertyKind: number,
  value: Uint8Array | string,
  pubkeyHex: string,
): Uint8Array {
  return _buildProfileUpdateUnsignedPayload(
    propertyKind,
    value,
    hexToBytes(pubkeyHex),
  );
}
