import { sha256 } from "@noble/hashes/sha256";
import { schnorr } from "@noble/curves/secp256k1";

/**
 * Sign an ORS v1 payload.
 *
 * Pass the output of any build*UnsignedPayload() from @opreturnsocial/protocol.
 * The first 4 bytes (ORS\x00 magic) are stripped to produce the v1 signing body
 * before hashing and signing.
 */
export function signV1Payload(v0UnsignedPayload: Buffer, privkeyHex: string): string {
  const v1Body = v0UnsignedPayload.subarray(4); // strip ORS\x00 prefix
  const msgHash = sha256(v1Body);
  const sig = schnorr.sign(msgHash, Buffer.from(privkeyHex, "hex"));
  return Buffer.from(sig).toString("hex");
}

export function derivePublicKey(privkeyHex: string): string {
  return Buffer.from(
    schnorr.getPublicKey(Buffer.from(privkeyHex, "hex")),
  ).toString("hex");
}
