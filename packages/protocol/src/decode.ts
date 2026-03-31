import {
  ORS_MAGIC,
  ORS_VERSION_V0,
  ORS_VERSION_V1,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROFILE_PROPERTY_BOT,
  DATA_OFFSET,
  PROPERTY_KIND_OFFSET,
  PROFILE_VALUE_OFFSET,
  PARENT_TXID_OFFSET,
  REPLY_CONTENT_OFFSET,
  KIND_OFFSET,
  PUBKEY_OFFSET,
  SIG_OFFSET,
  PUBKEY_BYTES,
  SIG_BYTES,
  OrsPost,
  OrsProfileUpdate,
  OrsTextReply,
  OrsRepost,
  OrsQuoteRepost,
  OrsFollow,
  ParsedOrsResult,
} from "./types.js";
import { equalBytes, bytesToHex, concatBytes } from "./helpers.js";

/**
 * Parse an ORS OP_RETURN payload.
 * Format: magic(3) + version(1) + pubkey(32) + sig(64) + kind(1) + kind-specific data
 * Minimum length: 102 bytes (101-byte header + 1 byte minimum data)
 */
export function parseORSPayload(data: Uint8Array): ParsedOrsResult {
  // Check minimum length: header(101) + at least 1 byte data
  if (data.length < DATA_OFFSET + 1) {
    return { supported: false, reason: "Too short" };
  }

  // Check magic
  if (!equalBytes(data.subarray(0, 3), ORS_MAGIC)) {
    return { supported: false, reason: "Wrong magic bytes" };
  }

  // Check version
  const version = data[3];
  if (version !== ORS_VERSION_V0) {
    return { supported: false, reason: `Unsupported version: ${version}` };
  }

  // Extract fixed-length header fields
  const pubkey = bytesToHex(data.subarray(PUBKEY_OFFSET, SIG_OFFSET));
  const sig = bytesToHex(data.subarray(SIG_OFFSET, KIND_OFFSET));

  // Read kind byte at offset 100
  const kind = data[KIND_OFFSET];

  if (kind === KIND_PROFILE_UPDATE) {
    // PROFILE_UPDATE: propertyKind at 101, value from 102
    if (data.length < PROFILE_VALUE_OFFSET) {
      return { supported: false, reason: "Too short for PROFILE_UPDATE" };
    }
    const propertyKind = data[PROPERTY_KIND_OFFSET];
    const valueBytes = data.subarray(PROFILE_VALUE_OFFSET);

    let content: string;
    if (propertyKind === PROFILE_PROPERTY_BOT) {
      content = valueBytes[0] === 0x01 ? "true" : "false";
    } else {
      content = new TextDecoder().decode(valueBytes);
    }

    const post: OrsProfileUpdate = {
      kind: 0x02,
      propertyKind,
      content,
      pubkey,
      sig,
    };
    return { supported: true, post };
  }

  if (kind === KIND_TEXT_REPLY) {
    // TEXT_REPLY: parentTxid(32) at 101, content from 133
    if (data.length < REPLY_CONTENT_OFFSET + 1) {
      return { supported: false, reason: "Too short for TEXT_REPLY" };
    }
    const parentTxid = bytesToHex(
      data.subarray(PARENT_TXID_OFFSET, REPLY_CONTENT_OFFSET),
    );
    const content = new TextDecoder().decode(
      data.subarray(REPLY_CONTENT_OFFSET),
    );
    const post: OrsTextReply = { kind: 0x03, parentTxid, content, pubkey, sig };
    return { supported: true, post };
  }

  if (kind === KIND_REPOST) {
    // REPOST: referencedTxid(32) at 101-132, no content
    if (data.length < REPLY_CONTENT_OFFSET) {
      return { supported: false, reason: "Too short for REPOST" };
    }
    const referencedTxid = bytesToHex(
      data.subarray(PARENT_TXID_OFFSET, REPLY_CONTENT_OFFSET),
    );
    const post: OrsRepost = { kind: 0x04, referencedTxid, pubkey, sig };
    return { supported: true, post };
  }

  if (kind === KIND_QUOTE_REPOST) {
    // QUOTE_REPOST: referencedTxid(32) at 101-132, content from 133
    if (data.length < REPLY_CONTENT_OFFSET + 1) {
      return { supported: false, reason: "Too short for QUOTE_REPOST" };
    }
    const referencedTxid = bytesToHex(
      data.subarray(PARENT_TXID_OFFSET, REPLY_CONTENT_OFFSET),
    );
    const content = new TextDecoder().decode(
      data.subarray(REPLY_CONTENT_OFFSET),
    );
    const post: OrsQuoteRepost = {
      kind: 0x05,
      referencedTxid,
      content,
      pubkey,
      sig,
    };
    return { supported: true, post };
  }

  if (kind === KIND_FOLLOW) {
    // FOLLOW: targetPubkey(32) at 101, isFollow(1) at 133
    if (data.length < DATA_OFFSET + PUBKEY_BYTES + 1) {
      return { supported: false, reason: "Too short for FOLLOW" };
    }
    const targetPubkey = bytesToHex(
      data.subarray(DATA_OFFSET, DATA_OFFSET + PUBKEY_BYTES),
    );
    const isFollow = data[DATA_OFFSET + PUBKEY_BYTES] === 0x01;
    const post: OrsFollow = { kind: 0x06, targetPubkey, isFollow, pubkey, sig };
    return { supported: true, post };
  }

  // TEXT_NOTE and other kinds: content is raw UTF-8 from offset 101
  const content = new TextDecoder().decode(data.subarray(DATA_OFFSET));
  const post: OrsPost = { kind, content, pubkey, sig };
  return { supported: true, post };
}

// ─── v1 chunk parsing ─────────────────────────────────────────────────────────

export interface V1ChunkInfo {
  chunkNum: number;
  totalChunks?: number; // only set for chunkNum === 0
  bodySlice: Uint8Array;
}

/**
 * Parse a v1 chunk from raw OP_RETURN payload bytes (magic already detected).
 *
 * Chunk 0: ORS(3) + 0x01(1) + 0x00(1) + totalChunks(1) + bodySlice
 * Chunk N: ORS(3) + 0x01(1) + N(1) + bodySlice
 */
export function parseV1Chunk(data: Uint8Array): V1ChunkInfo | null {
  if (data.length < 5) return null;
  if (!equalBytes(data.subarray(0, 3), ORS_MAGIC)) return null;
  if (data[3] !== ORS_VERSION_V1) return null;

  const chunkNum = data[4];

  if (chunkNum === 0) {
    // Root chunk requires at least 1 body byte after the 6-byte header
    if (data.length < 7) return null;
    const totalChunks = data[5];
    if (totalChunks < 2) return null; // degenerate
    const bodySlice = new Uint8Array(data.subarray(6));
    return { chunkNum: 0, totalChunks, bodySlice };
  }

  // Non-root chunk requires at least 1 body byte after the 5-byte header
  if (data.length < 6) return null;
  const bodySlice = new Uint8Array(data.subarray(5));
  return { chunkNum, bodySlice };
}

/**
 * Concatenate ordered body slices and parse the assembled body.
 *
 * body = pubkey(32) + sig(64) + kind(1) + kind_data
 *
 * Returns null if the assembled data is too short to be valid.
 */
export function assembleV1Body(slices: Uint8Array[]): {
  pubkey: Uint8Array;
  sig: Uint8Array;
  kind: number;
  kindData: Uint8Array;
} | null {
  const body = concatBytes(...slices);
  // Minimum: pubkey(32) + sig(64) + kind(1) = 97 bytes
  if (body.length < PUBKEY_BYTES + SIG_BYTES + 1) return null;

  const pubkey = body.subarray(0, PUBKEY_BYTES);
  const sig = body.subarray(PUBKEY_BYTES, PUBKEY_BYTES + SIG_BYTES);
  const kind = body[PUBKEY_BYTES + SIG_BYTES];
  const kindData = body.subarray(PUBKEY_BYTES + SIG_BYTES + 1);

  return { pubkey, sig, kind, kindData };
}
