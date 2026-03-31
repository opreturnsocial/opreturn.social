import { describe, it, expect } from "vitest";
import {
  buildORSPayload,
  buildProfileUpdatePayload,
  buildReplyPayload,
  buildRepostPayload,
  buildQuoteRepostPayload,
  buildFollowPayload,
  getUnsignedBytes,
} from "../../../src/encode.ts";
import { parseORSPayload } from "../../../src/decode.ts";
import {
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROFILE_PROPERTY_NAME,
  PROFILE_PROPERTY_BIO,
  PUBKEY_BYTES,
  SIG_BYTES,
} from "../../../src/types.ts";
import type {
  OrsTextReply,
  OrsRepost,
  OrsQuoteRepost,
  OrsFollow,
  OrsProfileUpdate,
} from "../../../src/types.ts";
import { bytesToHex } from "../../../src/helpers.ts";

// Dummy keys/sigs — the library does not verify signatures, only structure
const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0xab);
const SIG = new Uint8Array(SIG_BYTES).fill(0xcd);
const TXID = new Uint8Array(32).fill(0xef);
const TARGET = new Uint8Array(PUBKEY_BYTES).fill(0x01);

const PUBKEY_HEX = bytesToHex(PUBKEY);
const SIG_HEX = bytesToHex(SIG);
const TXID_HEX = bytesToHex(TXID);
const TARGET_HEX = bytesToHex(TARGET);

describe("v0 round-trip: TEXT_NOTE", () => {
  it("encodes and decodes a plain text post", () => {
    const content = "Hello bitcoin!";
    const result = parseORSPayload(buildORSPayload(content, PUBKEY, SIG));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_TEXT_NOTE);
    expect(result.post.content).toBe(content);
    expect(result.post.pubkey).toBe(PUBKEY_HEX);
    expect(result.post.sig).toBe(SIG_HEX);
  });

  it("preserves emoji and multi-byte UTF-8", () => {
    const content = "⚡ sending sats 🟠";
    const result = parseORSPayload(buildORSPayload(content, PUBKEY, SIG));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.content).toBe(content);
  });

  it("getUnsignedBytes recovers the exact unsigned payload", () => {
    const content = "test";
    const full = buildORSPayload(content, PUBKEY, SIG);
    const recovered = getUnsignedBytes(full);
    // Re-parse using the recovered unsigned: it should match a fresh unsigned build
    // The unsigned has no sig so we verify structure manually
    expect(recovered[36]).toBe(KIND_TEXT_NOTE);
    expect(new TextDecoder().decode(recovered.subarray(37))).toBe(content);
  });
});

describe("v0 round-trip: TEXT_REPLY", () => {
  it("encodes and decodes a reply", () => {
    const content = "great post!";
    const result = parseORSPayload(buildReplyPayload(content, PUBKEY, SIG, TXID));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_TEXT_REPLY);
    const reply = result.post as OrsTextReply;
    expect(reply.content).toBe(content);
    expect(reply.parentTxid).toBe(TXID_HEX);
    expect(reply.pubkey).toBe(PUBKEY_HEX);
    expect(reply.sig).toBe(SIG_HEX);
  });
});

describe("v0 round-trip: REPOST", () => {
  it("encodes and decodes a repost", () => {
    const result = parseORSPayload(buildRepostPayload(PUBKEY, SIG, TXID));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_REPOST);
    const repost = result.post as OrsRepost;
    expect(repost.referencedTxid).toBe(TXID_HEX);
    expect(repost.pubkey).toBe(PUBKEY_HEX);
    expect(repost.sig).toBe(SIG_HEX);
  });
});

describe("v0 round-trip: QUOTE_REPOST", () => {
  it("encodes and decodes a quote repost", () => {
    const content = "this aged well";
    const result = parseORSPayload(buildQuoteRepostPayload(content, PUBKEY, SIG, TXID));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_QUOTE_REPOST);
    const quote = result.post as OrsQuoteRepost;
    expect(quote.content).toBe(content);
    expect(quote.referencedTxid).toBe(TXID_HEX);
    expect(quote.pubkey).toBe(PUBKEY_HEX);
    expect(quote.sig).toBe(SIG_HEX);
  });
});

describe("v0 round-trip: FOLLOW", () => {
  it("encodes and decodes a follow", () => {
    const result = parseORSPayload(buildFollowPayload(TARGET, true, PUBKEY, SIG));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_FOLLOW);
    const follow = result.post as OrsFollow;
    expect(follow.targetPubkey).toBe(TARGET_HEX);
    expect(follow.isFollow).toBe(true);
    expect(follow.pubkey).toBe(PUBKEY_HEX);
  });

  it("encodes and decodes an unfollow", () => {
    const result = parseORSPayload(buildFollowPayload(TARGET, false, PUBKEY, SIG));
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const follow = result.post as OrsFollow;
    expect(follow.isFollow).toBe(false);
  });
});

describe("v0 round-trip: PROFILE_UPDATE", () => {
  it("encodes and decodes a name update", () => {
    const result = parseORSPayload(
      buildProfileUpdatePayload(PROFILE_PROPERTY_NAME, "Satoshi", PUBKEY, SIG)
    );
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.post.kind).toBe(KIND_PROFILE_UPDATE);
    const update = result.post as OrsProfileUpdate;
    expect(update.propertyKind).toBe(PROFILE_PROPERTY_NAME);
    expect(update.content).toBe("Satoshi");
  });

  it("encodes and decodes a bio update", () => {
    const bio = "Building on bitcoin since the beginning.";
    const result = parseORSPayload(
      buildProfileUpdatePayload(PROFILE_PROPERTY_BIO, bio, PUBKEY, SIG)
    );
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect((result.post as OrsProfileUpdate).content).toBe(bio);
  });

  it("encodes and decodes a bot flag (true)", () => {
    const result = parseORSPayload(
      buildProfileUpdatePayload(0x04, new Uint8Array([0x01]), PUBKEY, SIG)
    );
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect((result.post as OrsProfileUpdate).content).toBe("true");
  });
});
