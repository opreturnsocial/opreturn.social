import { describe, it, expect } from "vitest";
import { buildV1Chunks, buildV1SigningBody } from "../../../src/encode.ts";
import { parseV1Chunk, assembleV1Body } from "../../../src/decode.ts";
import {
  KIND_TEXT_NOTE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  KIND_PROFILE_UPDATE,
  PROFILE_PROPERTY_NAME,
  PUBKEY_BYTES,
  SIG_BYTES,
} from "../../../src/types.ts";
import { bytesToHex, concatBytes } from "../../../src/helpers.ts";

const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0xab);
const SIG = new Uint8Array(SIG_BYTES).fill(0xcd);
const TXID = new Uint8Array(32).fill(0xef);
const TARGET = new Uint8Array(PUBKEY_BYTES).fill(0x01);

function chunksRoundTrip(kind: number, kindData: Uint8Array): ReturnType<typeof assembleV1Body> {
  const chunks = buildV1Chunks(PUBKEY, SIG, kind, kindData);
  const slices: Uint8Array[] = [];
  for (const chunk of chunks) {
    const info = parseV1Chunk(chunk);
    if (!info) throw new Error(`Failed to parse chunk`);
    slices[info.chunkNum] = info.bodySlice;
  }
  return assembleV1Body(slices);
}

describe("v1 round-trip: TEXT_NOTE", () => {
  it("assembles back to the original pubkey, sig, kind, and content", () => {
    const content = "Hello v1!";
    const kindData = new TextEncoder().encode(content);
    const assembled = chunksRoundTrip(KIND_TEXT_NOTE, kindData);

    expect(assembled).not.toBeNull();
    expect(assembled!.pubkey).toEqual(PUBKEY);
    expect(assembled!.sig).toEqual(SIG);
    expect(assembled!.kind).toBe(KIND_TEXT_NOTE);
    expect(new TextDecoder().decode(assembled!.kindData)).toBe(content);
  });

  it("handles a long post requiring multiple chunks", () => {
    const content = "x".repeat(300);
    const kindData = new TextEncoder().encode(content);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    expect(chunks.length).toBeGreaterThan(2);

    const assembled = chunksRoundTrip(KIND_TEXT_NOTE, kindData);
    expect(assembled).not.toBeNull();
    expect(new TextDecoder().decode(assembled!.kindData)).toBe(content);
  });

  it("buildV1SigningBody matches the signing body inside the assembled chunks", () => {
    const kindData = new TextEncoder().encode("signing test");
    const signingBody = buildV1SigningBody(PUBKEY, KIND_TEXT_NOTE, kindData);

    const assembled = chunksRoundTrip(KIND_TEXT_NOTE, kindData);
    expect(assembled).not.toBeNull();

    // Reconstruct signing body from assembled parts
    const recoveredSigningBody = buildV1SigningBody(
      assembled!.pubkey,
      assembled!.kind,
      assembled!.kindData,
    );
    expect(recoveredSigningBody).toEqual(signingBody);
  });
});

describe("v1 round-trip: TEXT_REPLY", () => {
  it("preserves parentTxid and content", () => {
    const content = "replying via v1";
    const kindData = concatBytes(TXID, new TextEncoder().encode(content));
    const assembled = chunksRoundTrip(KIND_TEXT_REPLY, kindData);

    expect(assembled).not.toBeNull();
    expect(assembled!.kind).toBe(KIND_TEXT_REPLY);
    expect(bytesToHex(assembled!.kindData.subarray(0, 32))).toBe(bytesToHex(TXID));
    expect(new TextDecoder().decode(assembled!.kindData.subarray(32))).toBe(content);
  });
});

describe("v1 round-trip: REPOST", () => {
  it("preserves referencedTxid", () => {
    const assembled = chunksRoundTrip(KIND_REPOST, TXID);
    expect(assembled).not.toBeNull();
    expect(assembled!.kind).toBe(KIND_REPOST);
    expect(bytesToHex(assembled!.kindData)).toBe(bytesToHex(TXID));
  });
});

describe("v1 round-trip: QUOTE_REPOST", () => {
  it("preserves referencedTxid and content", () => {
    const content = "v1 quote";
    const kindData = concatBytes(TXID, new TextEncoder().encode(content));
    const assembled = chunksRoundTrip(KIND_QUOTE_REPOST, kindData);

    expect(assembled).not.toBeNull();
    expect(assembled!.kind).toBe(KIND_QUOTE_REPOST);
    expect(bytesToHex(assembled!.kindData.subarray(0, 32))).toBe(bytesToHex(TXID));
    expect(new TextDecoder().decode(assembled!.kindData.subarray(32))).toBe(content);
  });
});

describe("v1 round-trip: FOLLOW", () => {
  it("preserves targetPubkey and isFollow flag", () => {
    const kindData = concatBytes(TARGET, new Uint8Array([0x01]));
    const assembled = chunksRoundTrip(KIND_FOLLOW, kindData);

    expect(assembled).not.toBeNull();
    expect(assembled!.kind).toBe(KIND_FOLLOW);
    expect(bytesToHex(assembled!.kindData.subarray(0, 32))).toBe(bytesToHex(TARGET));
    expect(assembled!.kindData[32]).toBe(0x01);
  });
});

describe("v1 round-trip: PROFILE_UPDATE", () => {
  it("preserves propertyKind and value", () => {
    const name = "Satoshi";
    const kindData = concatBytes(
      new Uint8Array([PROFILE_PROPERTY_NAME]),
      new TextEncoder().encode(name),
    );
    const assembled = chunksRoundTrip(KIND_PROFILE_UPDATE, kindData);

    expect(assembled).not.toBeNull();
    expect(assembled!.kind).toBe(KIND_PROFILE_UPDATE);
    expect(assembled!.kindData[0]).toBe(PROFILE_PROPERTY_NAME);
    expect(new TextDecoder().decode(assembled!.kindData.subarray(1))).toBe(name);
  });
});

describe("v1 chunk count", () => {
  it("produces 2 chunks for minimal (empty) kindData", () => {
    // body = 32 + 64 + 1 + 0 = 97 bytes
    // chunk 0 holds 74, chunk 1 holds 23 => 2 chunks
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, new Uint8Array(0));
    expect(chunks.length).toBe(2);
  });

  it("produces 3 chunks when body exceeds 74 + 75 = 149 bytes", () => {
    // body = 97 + kindData.length > 149 => kindData.length > 52
    const kindData = new Uint8Array(53).fill(0x01);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    expect(chunks.length).toBe(3);
  });
});
