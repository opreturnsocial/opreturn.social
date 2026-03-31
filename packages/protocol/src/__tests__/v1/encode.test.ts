import { describe, it, expect } from "vitest";
import { buildV1SigningBody, buildV1Chunks } from "../../../src/encode.ts";
import {
  ORS_MAGIC,
  ORS_VERSION_V1,
  KIND_TEXT_NOTE,
  PUBKEY_BYTES,
  SIG_BYTES,
  V1_CHUNK0_DATA,
  V1_CHUNKN_DATA,
  V1_CHUNK0_HEADER,
  V1_CHUNKN_HEADER,
} from "../../../src/types.ts";
import { equalBytes } from "../../../src/helpers.ts";

const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0x11);
const SIG = new Uint8Array(SIG_BYTES).fill(0x22);

describe("buildV1SigningBody", () => {
  it("produces pubkey(32) + kind(1) + kindData", () => {
    const kindData = new TextEncoder().encode("hello");
    const body = buildV1SigningBody(PUBKEY, KIND_TEXT_NOTE, kindData);
    expect(body.length).toBe(PUBKEY_BYTES + 1 + kindData.length);
    expect(body.subarray(0, PUBKEY_BYTES)).toEqual(PUBKEY);
    expect(body[PUBKEY_BYTES]).toBe(KIND_TEXT_NOTE);
    expect(body.subarray(PUBKEY_BYTES + 1)).toEqual(kindData);
  });

  it("works with empty kindData", () => {
    const body = buildV1SigningBody(PUBKEY, KIND_TEXT_NOTE, new Uint8Array(0));
    expect(body.length).toBe(PUBKEY_BYTES + 1);
    expect(body[PUBKEY_BYTES]).toBe(KIND_TEXT_NOTE);
  });
});

describe("buildV1Chunks - structure", () => {
  it("produces at least one chunk for any input", () => {
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, new Uint8Array(0));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("chunk 0 starts with ORS magic + version 0x01 + 0x00 + totalChunks", () => {
    const kindData = new Uint8Array(10).fill(0xaa);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    const c0 = chunks[0];
    expect(equalBytes(c0.subarray(0, 3), ORS_MAGIC)).toBe(true);
    expect(c0[3]).toBe(ORS_VERSION_V1);
    expect(c0[4]).toBe(0x00); // chunk number
    expect(c0[5]).toBe(chunks.length); // totalChunks
  });

  it("non-root chunks start with ORS magic + version 0x01 + chunk number", () => {
    // Use enough kindData to force multiple chunks
    // body = pubkey(32) + sig(64) + kind(1) + kindData
    // chunk 0 holds 74 body bytes; each subsequent chunk holds 75
    // to get 2 chunks: body > 74, so kindData.length > 74 - 97 ... wait
    // body length = 32 + 64 + 1 + kindData.length = 97 + kindData.length
    // chunk 0 holds 74 body bytes
    // so we need body > 74: kindData.length > 74 - 97 = negative, so always > 1 chunk? No:
    // Actually chunk 0 holds min(74, body.length) body bytes
    // numNonRootChunks = ceil(max(0, body.length - 74) / 75)
    // body = 97 + kindData.length
    // For 2 chunks: body > 74, i.e. 97 + kindData.length > 74 — always true since 97 > 74
    // So any non-empty (actually even empty) kindData will produce >= 2 chunks
    // Let's verify: body = 97, numNonRootChunks = ceil((97-74)/75) = ceil(23/75) = 1, total = 2
    const kindData = new Uint8Array(0);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    expect(chunks.length).toBe(2);

    const c1 = chunks[1];
    expect(equalBytes(c1.subarray(0, 3), ORS_MAGIC)).toBe(true);
    expect(c1[3]).toBe(ORS_VERSION_V1);
    expect(c1[4]).toBe(1); // chunk number
  });

  it("each chunk is at most 80 bytes", () => {
    // Large kindData to force many chunks
    const kindData = new Uint8Array(500).fill(0xbb);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
  });

  it("chunk 0 body region is exactly min(74, body.length) bytes", () => {
    const kindData = new Uint8Array(0);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
    // body length = 97, chunk 0 body = min(74, 97) = 74
    expect(chunks[0].length).toBe(V1_CHUNK0_HEADER + 74);
  });

  it("totalChunks in chunk 0 matches actual chunk array length", () => {
    for (const size of [0, 10, 100, 300]) {
      const kindData = new Uint8Array(size).fill(0x01);
      const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);
      expect(chunks[0][5]).toBe(chunks.length);
    }
  });

  it("all body bytes are accounted for across all chunks", () => {
    const kindData = new Uint8Array(200).fill(0xcc);
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);

    // Reconstruct body from chunks
    const bodyParts: Uint8Array[] = [];
    bodyParts.push(chunks[0].subarray(V1_CHUNK0_HEADER));
    for (let i = 1; i < chunks.length; i++) {
      bodyParts.push(chunks[i].subarray(V1_CHUNKN_HEADER));
    }
    const totalBodyBytes = bodyParts.reduce((s, p) => s + p.length, 0);

    // Expected body length = pubkey(32) + sig(64) + kind(1) + kindData
    expect(totalBodyBytes).toBe(PUBKEY_BYTES + SIG_BYTES + 1 + kindData.length);
  });

  it("throws if pubkey is wrong length", () => {
    expect(() =>
      buildV1Chunks(new Uint8Array(31), SIG, KIND_TEXT_NOTE, new Uint8Array(0))
    ).toThrow("pubkey must be 32 bytes");
  });

  it("throws if sig is wrong length", () => {
    expect(() =>
      buildV1Chunks(PUBKEY, new Uint8Array(63), KIND_TEXT_NOTE, new Uint8Array(0))
    ).toThrow("sig must be 64 bytes");
  });
});
