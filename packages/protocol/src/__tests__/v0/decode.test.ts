import { describe, it, expect } from "vitest";
import { parseORSPayload } from "../../../src/decode.ts";
import {
  buildORSPayload,
  buildProfileUpdatePayload,
  buildReplyPayload,
  buildRepostPayload,
  buildQuoteRepostPayload,
  buildFollowPayload,
  buildUnsignedPayload,
  getUnsignedBytes,
} from "../../../src/encode.ts";
import {
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROFILE_PROPERTY_NAME,
  PUBKEY_BYTES,
  SIG_BYTES,
  SIG_OFFSET,
  KIND_OFFSET,
} from "../../../src/types.ts";
import type {
  OrsTextReply,
  OrsRepost,
  OrsQuoteRepost,
  OrsFollow,
  OrsProfileUpdate,
} from "../../../src/types.ts";
import { bytesToHex } from "../../../src/helpers.ts";

const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0x11);
const SIG = new Uint8Array(SIG_BYTES).fill(0x22);
const TXID = new Uint8Array(32).fill(0x33);
const TARGET = new Uint8Array(PUBKEY_BYTES).fill(0x44);

const PUBKEY_HEX = bytesToHex(PUBKEY);
const SIG_HEX = bytesToHex(SIG);
const TXID_HEX = bytesToHex(TXID);
const TARGET_HEX = bytesToHex(TARGET);

describe("parseORSPayload - invalid inputs", () => {
  it("returns unsupported for empty data", () => {
    const result = parseORSPayload(new Uint8Array(0));
    expect(result.supported).toBe(false);
  });

  it("returns unsupported for data that is too short", () => {
    const result = parseORSPayload(new Uint8Array(50));
    expect(result.supported).toBe(false);
    expect(result.supported === false && result.reason).toBe("Too short");
  });

  it("returns unsupported for wrong magic bytes", () => {
    const payload = buildORSPayload("hello", PUBKEY, SIG);
    payload[0] = 0xff;
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(false);
    expect(result.supported === false && result.reason).toBe("Wrong magic bytes");
  });

  it("returns unsupported for wrong version byte", () => {
    const payload = buildORSPayload("hello", PUBKEY, SIG);
    payload[3] = 0x99;
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(false);
    expect(result.supported === false && result.reason).toMatch(/Unsupported version/);
  });
});

describe("parseORSPayload - TEXT_NOTE", () => {
  it("parses pubkey, sig, kind, and content", () => {
    const payload = buildORSPayload("Hello bitcoin!", PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.pubkey).toBe(PUBKEY_HEX);
    expect(result.post.sig).toBe(SIG_HEX);
    expect(result.post.kind).toBe(KIND_TEXT_NOTE);
    expect(result.post.content).toBe("Hello bitcoin!");
  });

  it("handles multi-byte UTF-8 content", () => {
    const text = "⚡ sats";
    const payload = buildORSPayload(text, PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.content).toBe(text);
  });
});

describe("parseORSPayload - TEXT_REPLY", () => {
  it("parses parentTxid and content", () => {
    const payload = buildReplyPayload("nice post", PUBKEY, SIG, TXID);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_TEXT_REPLY);
    const reply = result.post as OrsTextReply;
    expect(reply.parentTxid).toBe(TXID_HEX);
    expect(reply.content).toBe("nice post");
  });

  it("returns unsupported if too short for TEXT_REPLY", () => {
    const payload = buildReplyPayload("hi", PUBKEY, SIG, TXID);
    const result = parseORSPayload(payload.subarray(0, 133));
    // Truncated to exactly REPLY_CONTENT_OFFSET (133) — needs at least 134 bytes
    expect(result.supported).toBe(false);
  });
});

describe("parseORSPayload - REPOST", () => {
  it("parses referencedTxid", () => {
    const payload = buildRepostPayload(PUBKEY, SIG, TXID);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_REPOST);
    const repost = result.post as OrsRepost;
    expect(repost.referencedTxid).toBe(TXID_HEX);
  });
});

describe("parseORSPayload - QUOTE_REPOST", () => {
  it("parses referencedTxid and content", () => {
    const payload = buildQuoteRepostPayload("my take", PUBKEY, SIG, TXID);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_QUOTE_REPOST);
    const quote = result.post as OrsQuoteRepost;
    expect(quote.referencedTxid).toBe(TXID_HEX);
    expect(quote.content).toBe("my take");
  });
});

describe("parseORSPayload - FOLLOW", () => {
  it("parses targetPubkey and isFollow=true", () => {
    const payload = buildFollowPayload(TARGET, true, PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_FOLLOW);
    const follow = result.post as OrsFollow;
    expect(follow.targetPubkey).toBe(TARGET_HEX);
    expect(follow.isFollow).toBe(true);
  });

  it("parses isFollow=false", () => {
    const payload = buildFollowPayload(TARGET, false, PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const follow = result.post as OrsFollow;
    expect(follow.isFollow).toBe(false);
  });
});

describe("parseORSPayload - PROFILE_UPDATE", () => {
  it("parses propertyKind and string value", () => {
    const payload = buildProfileUpdatePayload(PROFILE_PROPERTY_NAME, "Satoshi", PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_PROFILE_UPDATE);
    const update = result.post as OrsProfileUpdate;
    expect(update.propertyKind).toBe(PROFILE_PROPERTY_NAME);
    expect(update.content).toBe("Satoshi");
  });

  it("parses bot flag 0x01 as 'true'", () => {
    const payload = buildProfileUpdatePayload(0x04, new Uint8Array([0x01]), PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const update = result.post as OrsProfileUpdate;
    expect(update.content).toBe("true");
  });

  it("parses bot flag 0x00 as 'false'", () => {
    const payload = buildProfileUpdatePayload(0x04, new Uint8Array([0x00]), PUBKEY, SIG);
    const result = parseORSPayload(payload);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const update = result.post as OrsProfileUpdate;
    expect(update.content).toBe("false");
  });
});

describe("getUnsignedBytes", () => {
  it("removes the 64-byte sig slot from a full payload", () => {
    const unsigned = buildUnsignedPayload("hello", PUBKEY);
    const full = buildORSPayload("hello", PUBKEY, SIG);
    const recovered = getUnsignedBytes(full);
    expect(recovered).toEqual(unsigned);
  });

  it("recovered unsigned has correct length (full - 64 bytes)", () => {
    const full = buildORSPayload("hi", PUBKEY, SIG);
    const recovered = getUnsignedBytes(full);
    expect(recovered.length).toBe(full.length - SIG_BYTES);
  });

  it("recovered unsigned does not contain the sig", () => {
    const full = buildORSPayload("hi", PUBKEY, SIG);
    const recovered = getUnsignedBytes(full);
    // The sig (all 0x22) should not appear anywhere in the recovered bytes
    const sigPresent = recovered.some((b) => b === 0x22);
    expect(sigPresent).toBe(false);
  });
});
