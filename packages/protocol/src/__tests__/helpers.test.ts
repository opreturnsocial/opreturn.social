import { describe, it, expect } from "vitest";
import { hexToBytes, bytesToHex, concatBytes, equalBytes } from "../../src/helpers.ts";

describe("hexToBytes", () => {
  it("converts a hex string to bytes", () => {
    expect(hexToBytes("deadbeef")).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("handles an empty string", () => {
    expect(hexToBytes("")).toEqual(new Uint8Array([]));
  });

  it("handles all-zero bytes", () => {
    expect(hexToBytes("000000")).toEqual(new Uint8Array([0, 0, 0]));
  });

  it("handles uppercase hex", () => {
    expect(hexToBytes("DEADBEEF")).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("throws on odd-length hex string", () => {
    expect(() => hexToBytes("abc")).toThrow("Invalid hex string");
  });

  it("round-trips with bytesToHex", () => {
    const hex = "4f52530001020304";
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });
});

describe("bytesToHex", () => {
  it("converts bytes to a hex string", () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("deadbeef");
  });

  it("handles an empty array", () => {
    expect(bytesToHex(new Uint8Array([]))).toBe("");
  });

  it("zero-pads single-digit hex values", () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0x10]))).toBe("000f10");
  });

  it("round-trips with hexToBytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 255, 0, 128]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });
});

describe("concatBytes", () => {
  it("concatenates two arrays", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("concatenates three arrays", () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);
    expect(concatBytes(a, b, c)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("handles empty arrays", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([]);
    expect(concatBytes(a, b)).toEqual(new Uint8Array([1, 2]));
  });

  it("returns empty array when given no arguments", () => {
    expect(concatBytes()).toEqual(new Uint8Array([]));
  });

  it("does not mutate input arrays", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    concatBytes(a, b);
    expect(a).toEqual(new Uint8Array([1, 2]));
    expect(b).toEqual(new Uint8Array([3, 4]));
  });
});

describe("equalBytes", () => {
  it("returns true for identical arrays", () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("returns false for arrays with different values", () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it("returns false for arrays of different lengths", () => {
    expect(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it("returns true for two empty arrays", () => {
    expect(equalBytes(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});
