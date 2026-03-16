export const ORS_MAGIC = Buffer.from([0x4f, 0x52, 0x53]); // "ORS"
export const ORS_VERSION = 0x00;
export const ORS_VERSION_V1 = 0x01;

// v1 chunk header sizes
export const V1_CHUNK0_HEADER = 6;  // ORS(3)+ver(1)+chunkNum(1)+totalChunks(1)
export const V1_CHUNKN_HEADER = 5;  // ORS(3)+ver(1)+chunkNum(1)
// v1 body bytes per chunk slot
export const V1_CHUNK0_DATA = 74;   // body bytes in chunk 0
export const V1_CHUNKN_DATA = 75;   // body bytes in chunk N (N>=1)

export const KIND_TEXT_NOTE = 0x01;
export const KIND_PROFILE_UPDATE = 0x02;
export const KIND_TEXT_REPLY = 0x03;
export const KIND_REPOST = 0x04;
export const KIND_QUOTE_REPOST = 0x05;
export const KIND_FOLLOW = 0x06;

// Header layout: magic(3) + version(1) + pubkey(32) + sig(64) + kind(1) = 101 bytes
export const PUBKEY_OFFSET = 4;
export const SIG_OFFSET = 36;
export const KIND_OFFSET = 100;
export const DATA_OFFSET = 101;
export const PROPERTY_KIND_OFFSET = 101;
export const PROFILE_VALUE_OFFSET = 102;
export const PUBKEY_BYTES = 32;
export const SIG_BYTES = 64;

// TEXT_REPLY layout: ...header(101) + parentTxid(32) + content
export const PARENT_TXID_BYTES = 32;
export const PARENT_TXID_OFFSET = 101;
export const REPLY_CONTENT_OFFSET = 133;

export const MAX_CONTENT_BYTES = 277;

// Profile property kind values
export const PROPERTY_NAME = 0x00;
export const PROPERTY_AVATAR_URL = 0x01;
export const PROPERTY_BIO = 0x02;
export const PROPERTY_BANNER_URL = 0x03;
export const PROPERTY_BOT = 0x04;
export const PROPERTY_WEBSITE_URL = 0x05;

export interface OrsPost {
  kind: number;
  content: string;
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export interface OrsProfileUpdate {
  kind: 0x02;
  propertyKind: number;
  content: string;
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export interface OrsTextReply {
  kind: 0x03;
  parentTxid: string; // 32-byte hex (64 chars)
  content: string;
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export interface OrsRepost {
  kind: 0x04;
  referencedTxid: string; // 32-byte hex (64 chars)
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export interface OrsQuoteRepost {
  kind: 0x05;
  referencedTxid: string; // 32-byte hex (64 chars)
  content: string;
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export interface OrsFollow {
  kind: 0x06;
  targetPubkey: string; // 32-byte hex (64 chars)
  isFollow: boolean;
  pubkey: string; // 32-byte hex (64 chars)
  sig: string; // 64-byte hex (128 chars)
}

export type ParsedOrsResult =
  | { supported: true; post: OrsPost | OrsProfileUpdate | OrsTextReply | OrsRepost | OrsQuoteRepost | OrsFollow }
  | { supported: false; reason: string };
