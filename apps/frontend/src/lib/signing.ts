import { sha256 } from "@noble/hashes/sha256";
import { schnorr } from "@noble/curves/secp256k1";

export async function signPayload(
  unsignedPayload: Uint8Array,
  expectedPubkey?: string,
): Promise<string> {
  const msgHash = sha256(unsignedPayload);
  const privkeyHex = localStorage.getItem("ors_local_privkey");

  if (privkeyHex) {
    const privkeyBytes = Uint8Array.from(
      privkeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const sig = schnorr.sign(msgHash, privkeyBytes);
    return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  if (!window.nostr) throw new Error("Alby extension not found.");

  if (expectedPubkey) {
    const extensionPubkey = await window.nostr.getPublicKey();
    if (extensionPubkey !== expectedPubkey) {
      throw new Error(
        `Wrong account - you're logged in as ${expectedPubkey.slice(0, 8)}…, but Alby is using ${extensionPubkey.slice(0, 8)}…`,
      );
    }
  }

  const msgHex = Array.from(msgHash).map((b) => b.toString(16).padStart(2, "0")).join("");
  return window.nostr.signSchnorr(msgHex);
}
