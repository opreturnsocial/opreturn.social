import { describe, it, expect } from "vitest";
import {
  buildUnsignedPayload,
  buildProfileUpdateUnsignedPayload,
  buildReplyUnsignedPayload,
  buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload,
  buildFollowUnsignedPayload,
  buildORSPayload,
  buildProfileUpdatePayload,
  buildReplyPayload,
  buildRepostPayload,
  buildQuoteRepostPayload,
  buildFollowPayload,
} from "../../../src/encode.ts";
import { hexToBytes, bytesToHex } from "../../../src/helpers.ts";
import {
  ORS_MAGIC,
  ORS_VERSION_V0,
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
  DATA_OFFSET,
} from "../../../src/types.ts";

const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0x11);
const SIG = new Uint8Array(SIG_BYTES).fill(0x22);
const TXID = new Uint8Array(32).fill(0x33);

function checkHeader(buf: Uint8Array, expectedKind: number): void {
  // magic bytes
  expect(buf[0]).toBe(0x4f);
  expect(buf[1]).toBe(0x52);
  expect(buf[2]).toBe(0x53);
  // version
  expect(buf[3]).toBe(ORS_VERSION_V0);
  // pubkey
  expect(buf.subarray(4, 36)).toEqual(PUBKEY);
}

describe("buildUnsignedPayload (TEXT_NOTE)", () => {
  it("has correct magic, version, pubkey, and kind", () => {
    const buf = buildUnsignedPayload("hello", PUBKEY);
    checkHeader(buf, KIND_TEXT_NOTE);
    expect(buf[36]).toBe(KIND_TEXT_NOTE);
  });

  it("encodes content as UTF-8 after the kind byte", () => {
    const buf = buildUnsignedPayload("hello", PUBKEY);
    const content = new TextDecoder().decode(buf.subarray(37));
    expect(content).toBe("hello");
  });

  it("encodes multi-byte UTF-8 content correctly", () => {
    const text = "⚡ bitcoin";
    const buf = buildUnsignedPayload(text, PUBKEY);
    const content = new TextDecoder().decode(buf.subarray(37));
    expect(content).toBe(text);
  });

  it("has correct total length", () => {
    const content = "hi";
    const contentBytes = new TextEncoder().encode(content);
    const buf = buildUnsignedPayload(content, PUBKEY);
    // magic(3) + version(1) + pubkey(32) + kind(1) + content
    expect(buf.length).toBe(37 + contentBytes.length);
  });

  it("throws if pubkey is wrong length", () => {
    expect(() => buildUnsignedPayload("hi", new Uint8Array(31))).toThrow(
      "pubkey must be 32 bytes",
    );
  });

  it("throws if content exceeds MAX_CONTENT_BYTES", () => {
    const tooLong = "x".repeat(278);
    expect(() => buildUnsignedPayload(tooLong, PUBKEY)).toThrow(
      "Content too long",
    );
  });

  it("accepts content of exactly MAX_CONTENT_BYTES", () => {
    const maxContent = "x".repeat(277);
    expect(() => buildUnsignedPayload(maxContent, PUBKEY)).not.toThrow();
  });
});

describe("buildProfileUpdateUnsignedPayload", () => {
  it("encodes string value correctly", () => {
    const buf = buildProfileUpdateUnsignedPayload(
      PROFILE_PROPERTY_NAME,
      "Satoshi",
      PUBKEY,
    );
    expect(buf[36]).toBe(KIND_PROFILE_UPDATE);
    expect(buf[37]).toBe(PROFILE_PROPERTY_NAME);
    expect(new TextDecoder().decode(buf.subarray(38))).toBe("Satoshi");
  });

  it("encodes Uint8Array value directly", () => {
    const value = new Uint8Array([0x01]);
    const buf = buildProfileUpdateUnsignedPayload(0x04, value, PUBKEY);
    expect(buf[38]).toBe(0x01);
  });

  it("throws if pubkey is wrong length", () => {
    expect(() =>
      buildProfileUpdateUnsignedPayload(
        PROFILE_PROPERTY_NAME,
        "x",
        new Uint8Array(33),
      ),
    ).toThrow("pubkey must be 32 bytes");
  });
});

describe("buildReplyUnsignedPayload", () => {
  it("encodes kind, parentTxid, and content", () => {
    const buf = buildReplyUnsignedPayload("reply!", PUBKEY, TXID);
    expect(buf[36]).toBe(KIND_TEXT_REPLY);
    expect(buf.subarray(37, 69)).toEqual(TXID);
    expect(new TextDecoder().decode(buf.subarray(69))).toBe("reply!");
  });

  it("throws if parentTxidBytes is wrong length", () => {
    expect(() =>
      buildReplyUnsignedPayload("hi", PUBKEY, new Uint8Array(31)),
    ).toThrow("parentTxid must be 32 bytes");
  });
});

describe("buildRepostUnsignedPayload", () => {
  it("encodes kind and referencedTxid", () => {
    const buf = buildRepostUnsignedPayload(PUBKEY, TXID);
    expect(buf[36]).toBe(KIND_REPOST);
    expect(buf.subarray(37, 69)).toEqual(TXID);
  });

  it("throws if referencedTxid is wrong length", () => {
    expect(() =>
      buildRepostUnsignedPayload(PUBKEY, new Uint8Array(33)),
    ).toThrow("referencedTxid must be 32 bytes");
  });
});

describe("buildQuoteRepostUnsignedPayload", () => {
  it("encodes kind, referencedTxid, and content", () => {
    const buf = buildQuoteRepostUnsignedPayload("great post", PUBKEY, TXID);
    expect(buf[36]).toBe(KIND_QUOTE_REPOST);
    expect(buf.subarray(37, 69)).toEqual(TXID);
    expect(new TextDecoder().decode(buf.subarray(69))).toBe("great post");
  });
});

describe("buildFollowUnsignedPayload", () => {
  const TARGET = new Uint8Array(PUBKEY_BYTES).fill(0x44);

  it("encodes kind, targetPubkey, and isFollow=true", () => {
    const buf = buildFollowUnsignedPayload(TARGET, true, PUBKEY);
    expect(buf[36]).toBe(KIND_FOLLOW);
    expect(buf.subarray(37, 69)).toEqual(TARGET);
    expect(buf[69]).toBe(0x01);
  });

  it("encodes isFollow=false as 0x00", () => {
    const buf = buildFollowUnsignedPayload(TARGET, false, PUBKEY);
    expect(buf[69]).toBe(0x00);
  });

  it("throws if targetPubkey is wrong length", () => {
    expect(() =>
      buildFollowUnsignedPayload(new Uint8Array(31), true, PUBKEY),
    ).toThrow("targetPubkey must be 32 bytes");
  });
});

describe("full payload builders (sig insertion)", () => {
  it("buildORSPayload inserts sig at SIG_OFFSET and shifts kind+data to KIND_OFFSET", () => {
    const payload = buildORSPayload("hello", PUBKEY, SIG);
    // header stays the same
    expect(payload.subarray(0, 4)).toEqual(
      new Uint8Array([0x4f, 0x52, 0x53, ORS_VERSION_V0]),
    );
    expect(payload.subarray(4, 36)).toEqual(PUBKEY);
    // sig at offset 36
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    // kind byte at offset 100
    expect(payload[KIND_OFFSET]).toBe(KIND_TEXT_NOTE);
    // content follows
    expect(new TextDecoder().decode(payload.subarray(DATA_OFFSET))).toBe(
      "hello",
    );
  });

  it("buildORSPayload total length is unsigned + SIG_BYTES", () => {
    const unsigned = buildUnsignedPayload("hi", PUBKEY);
    const payload = buildORSPayload("hi", PUBKEY, SIG);
    expect(payload.length).toBe(unsigned.length + SIG_BYTES);
  });

  it("buildReplyPayload inserts sig correctly", () => {
    const payload = buildReplyPayload("reply", PUBKEY, SIG, TXID);
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    expect(payload[KIND_OFFSET]).toBe(KIND_TEXT_REPLY);
  });

  it("buildRepostPayload inserts sig correctly", () => {
    const payload = buildRepostPayload(PUBKEY, SIG, TXID);
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    expect(payload[KIND_OFFSET]).toBe(KIND_REPOST);
  });

  it("buildQuoteRepostPayload inserts sig correctly", () => {
    const payload = buildQuoteRepostPayload("quote", PUBKEY, SIG, TXID);
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    expect(payload[KIND_OFFSET]).toBe(KIND_QUOTE_REPOST);
  });

  it("buildFollowPayload inserts sig correctly", () => {
    const TARGET = new Uint8Array(PUBKEY_BYTES).fill(0x44);
    const payload = buildFollowPayload(TARGET, true, PUBKEY, SIG);
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    expect(payload[KIND_OFFSET]).toBe(KIND_FOLLOW);
  });

  it("buildProfileUpdatePayload inserts sig correctly", () => {
    const payload = buildProfileUpdatePayload(
      PROFILE_PROPERTY_NAME,
      "Satoshi",
      PUBKEY,
      SIG,
    );
    expect(payload.subarray(SIG_OFFSET, KIND_OFFSET)).toEqual(SIG);
    expect(payload[KIND_OFFSET]).toBe(KIND_PROFILE_UPDATE);
  });

  it("throws if sig is wrong length", () => {
    expect(() => buildORSPayload("hi", PUBKEY, new Uint8Array(63))).toThrow(
      "sig must be 64 bytes",
    );
  });
});
