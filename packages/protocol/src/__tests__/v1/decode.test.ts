import { describe, it, expect } from "vitest";
import { parseV1Chunk, assembleV1Body } from "../../../src/decode.ts";
import { buildV1Chunks } from "../../../src/encode.ts";
import {
  ORS_MAGIC,
  ORS_VERSION_V1,
  KIND_TEXT_NOTE,
  PUBKEY_BYTES,
  SIG_BYTES,
} from "../../../src/types.ts";
import { concatBytes } from "../../../src/helpers.ts";

const PUBKEY = new Uint8Array(PUBKEY_BYTES).fill(0x11);
const SIG = new Uint8Array(SIG_BYTES).fill(0x22);

function makeChunk0(totalChunks: number, bodySlice: Uint8Array): Uint8Array {
  const buf = new Uint8Array(6 + bodySlice.length);
  buf.set(ORS_MAGIC, 0);
  buf[3] = ORS_VERSION_V1;
  buf[4] = 0x00;
  buf[5] = totalChunks;
  buf.set(bodySlice, 6);
  return buf;
}

function makeChunkN(n: number, bodySlice: Uint8Array): Uint8Array {
  const buf = new Uint8Array(5 + bodySlice.length);
  buf.set(ORS_MAGIC, 0);
  buf[3] = ORS_VERSION_V1;
  buf[4] = n;
  buf.set(bodySlice, 5);
  return buf;
}

describe("parseV1Chunk - chunk 0", () => {
  it("parses a valid chunk 0", () => {
    const body = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const chunk = makeChunk0(3, body);
    const info = parseV1Chunk(chunk);
    expect(info).not.toBeNull();
    expect(info!.chunkNum).toBe(0);
    expect(info!.totalChunks).toBe(3);
    expect(info!.bodySlice).toEqual(body);
  });

  it("returns null if totalChunks < 2 (degenerate)", () => {
    const chunk = makeChunk0(1, new Uint8Array([0xaa]));
    expect(parseV1Chunk(chunk)).toBeNull();
  });

  it("returns null if too short (no body bytes)", () => {
    const buf = new Uint8Array(6); // exactly header, no body
    buf.set(ORS_MAGIC, 0);
    buf[3] = ORS_VERSION_V1;
    buf[4] = 0x00;
    buf[5] = 2;
    expect(parseV1Chunk(buf)).toBeNull();
  });
});

describe("parseV1Chunk - non-root chunks", () => {
  it("parses chunk N correctly", () => {
    const body = new Uint8Array([0x01, 0x02, 0x03]);
    const chunk = makeChunkN(2, body);
    const info = parseV1Chunk(chunk);
    expect(info).not.toBeNull();
    expect(info!.chunkNum).toBe(2);
    expect(info!.totalChunks).toBeUndefined();
    expect(info!.bodySlice).toEqual(body);
  });

  it("returns null if too short (no body bytes after 5-byte header)", () => {
    const buf = new Uint8Array(5);
    buf.set(ORS_MAGIC, 0);
    buf[3] = ORS_VERSION_V1;
    buf[4] = 1;
    expect(parseV1Chunk(buf)).toBeNull();
  });
});

describe("parseV1Chunk - invalid inputs", () => {
  it("returns null for data shorter than 5 bytes", () => {
    expect(parseV1Chunk(new Uint8Array(4))).toBeNull();
  });

  it("returns null for wrong magic bytes", () => {
    const chunk = makeChunk0(2, new Uint8Array([0xaa]));
    chunk[0] = 0xff;
    expect(parseV1Chunk(chunk)).toBeNull();
  });

  it("returns null for wrong version byte", () => {
    const chunk = makeChunk0(2, new Uint8Array([0xaa]));
    chunk[3] = 0x00; // v0, not v1
    expect(parseV1Chunk(chunk)).toBeNull();
  });
});

describe("assembleV1Body", () => {
  it("assembles slices into pubkey, sig, kind, kindData", () => {
    const kindData = new TextEncoder().encode("hello");
    const chunks = buildV1Chunks(PUBKEY, SIG, KIND_TEXT_NOTE, kindData);

    const slices: Uint8Array[] = [];
    for (const chunk of chunks) {
      const info = parseV1Chunk(chunk);
      expect(info).not.toBeNull();
      slices[info!.chunkNum] = info!.bodySlice;
    }

    const assembled = assembleV1Body(slices);
    expect(assembled).not.toBeNull();
    expect(assembled!.pubkey).toEqual(PUBKEY);
    expect(assembled!.sig).toEqual(SIG);
    expect(assembled!.kind).toBe(KIND_TEXT_NOTE);
    expect(assembled!.kindData).toEqual(kindData);
  });

  it("returns null if body is too short (< 97 bytes)", () => {
    const tooShort = [new Uint8Array(50)];
    expect(assembleV1Body(tooShort)).toBeNull();
  });

  it("returns null for empty slices array", () => {
    expect(assembleV1Body([])).toBeNull();
  });

  it("handles empty kindData (body exactly 97 bytes)", () => {
    const body = concatBytes(PUBKEY, SIG, new Uint8Array([KIND_TEXT_NOTE]));
    const assembled = assembleV1Body([body]);
    expect(assembled).not.toBeNull();
    expect(assembled!.kindData.length).toBe(0);
  });
});
