import crypto from "node:crypto";
import * as tinysecp from "tiny-secp256k1";
import {
  buildORSPayload,
  buildUnsignedPayload,
  buildProfileUpdatePayload,
  buildProfileUpdateUnsignedPayload,
  buildReplyPayload,
  buildReplyUnsignedPayload,
  buildRepostPayload,
  buildRepostUnsignedPayload,
  buildQuoteRepostPayload,
  buildQuoteRepostUnsignedPayload,
  buildFollowPayload,
  buildFollowUnsignedPayload,
  buildV1SigningBody,
  buildV1Chunks,
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PUBKEY_BYTES,
  PARENT_TXID_BYTES,
  SIG_BYTES,
} from "@ors/protocol";

function verifySchnorrBytes(msgHash: Buffer, pubkey: Buffer, sig: Buffer): void {
  const valid = tinysecp.verifySchnorr(msgHash, pubkey, sig);
  if (!valid) throw new Error("Invalid Schnorr signature");
}

function verifySchnorr(unsignedPayload: Uint8Array, pubkey: string, sig: string): void {
  const msgHash = crypto.createHash("sha256").update(unsignedPayload).digest();
  const valid = tinysecp.verifySchnorr(
    msgHash,
    Buffer.from(pubkey, "hex"),
    Buffer.from(sig, "hex")
  );
  if (!valid) throw new Error("Invalid Schnorr signature");
}

export function buildPayload(content: string, pubkey: string, sig: string): string {
  const unsignedPayload = buildUnsignedPayload(content, Buffer.from(pubkey, "hex"));
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildORSPayload(content, Buffer.from(pubkey, "hex"), Buffer.from(sig, "hex"));
  return payload.toString("hex");
}

export function buildPayloadReply(
  content: string,
  pubkey: string,
  sig: string,
  parentTxid: string
): string {
  const parentTxidBytes = Buffer.from(parentTxid, "hex");
  const unsignedPayload = buildReplyUnsignedPayload(content, Buffer.from(pubkey, "hex"), parentTxidBytes);
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildReplyPayload(
    content,
    Buffer.from(pubkey, "hex"),
    Buffer.from(sig, "hex"),
    parentTxidBytes
  );
  return payload.toString("hex");
}

export function buildPayloadRepost(pubkey: string, sig: string, referencedTxid: string): string {
  const referencedTxidBytes = Buffer.from(referencedTxid, "hex");
  const unsignedPayload = buildRepostUnsignedPayload(Buffer.from(pubkey, "hex"), referencedTxidBytes);
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildRepostPayload(
    Buffer.from(pubkey, "hex"),
    Buffer.from(sig, "hex"),
    referencedTxidBytes
  );
  return payload.toString("hex");
}

export function buildPayloadQuoteRepost(
  content: string,
  pubkey: string,
  sig: string,
  referencedTxid: string
): string {
  const referencedTxidBytes = Buffer.from(referencedTxid, "hex");
  const unsignedPayload = buildQuoteRepostUnsignedPayload(content, Buffer.from(pubkey, "hex"), referencedTxidBytes);
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildQuoteRepostPayload(
    content,
    Buffer.from(pubkey, "hex"),
    Buffer.from(sig, "hex"),
    referencedTxidBytes
  );
  return payload.toString("hex");
}

export function buildPayloadFollow(
  targetPubkey: string,
  isFollow: boolean,
  pubkey: string,
  sig: string
): string {
  const targetPubkeyBuf = Buffer.from(targetPubkey, "hex");
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const unsignedPayload = buildFollowUnsignedPayload(targetPubkeyBuf, isFollow, pubkeyBuf);
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildFollowPayload(targetPubkeyBuf, isFollow, pubkeyBuf, Buffer.from(sig, "hex"));
  return payload.toString("hex");
}

export function buildPayloadProfile(
  propertyKind: number,
  value: string,
  pubkey: string,
  sig: string
): string {
  const unsignedPayload = buildProfileUpdateUnsignedPayload(
    propertyKind,
    value,
    Buffer.from(pubkey, "hex")
  );
  verifySchnorr(unsignedPayload, pubkey, sig);
  const payload = buildProfileUpdatePayload(
    propertyKind,
    value,
    Buffer.from(pubkey, "hex"),
    Buffer.from(sig, "hex")
  );
  return payload.toString("hex");
}

// ─── v1 (chunked 80-byte OP_RETURN) ─────────────────────────────────────────

function verifyV1Schnorr(pubkeyBuf: Buffer, kind: number, kindData: Buffer, sig: string): void {
  const sigBuf = Buffer.from(sig, "hex");
  const signingBody = buildV1SigningBody(pubkeyBuf, kind, kindData);
  const msgHash = crypto.createHash("sha256").update(signingBody).digest();
  verifySchnorrBytes(msgHash, pubkeyBuf, sigBuf);
}

function buildV1ChunkHexes(pubkeyBuf: Buffer, sig: string, kind: number, kindData: Buffer): string[] {
  const chunks = buildV1Chunks(pubkeyBuf, Buffer.from(sig, "hex"), kind, kindData);
  return chunks.map((c) => c.toString("hex"));
}

export function buildPayloadV1(content: string, pubkey: string, sig: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.from(content, "utf8");
  verifyV1Schnorr(pubkeyBuf, KIND_TEXT_NOTE, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_TEXT_NOTE, kindData);
}

export function buildPayloadReplyV1(content: string, pubkey: string, sig: string, parentTxid: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.concat([Buffer.from(parentTxid, "hex"), Buffer.from(content, "utf8")]);
  verifyV1Schnorr(pubkeyBuf, KIND_TEXT_REPLY, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_TEXT_REPLY, kindData);
}

export function buildPayloadRepostV1(pubkey: string, sig: string, referencedTxid: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.from(referencedTxid, "hex");
  verifyV1Schnorr(pubkeyBuf, KIND_REPOST, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_REPOST, kindData);
}

export function buildPayloadQuoteRepostV1(content: string, pubkey: string, sig: string, referencedTxid: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.concat([Buffer.from(referencedTxid, "hex"), Buffer.from(content, "utf8")]);
  verifyV1Schnorr(pubkeyBuf, KIND_QUOTE_REPOST, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_QUOTE_REPOST, kindData);
}

export function buildPayloadFollowV1(targetPubkey: string, isFollow: boolean, pubkey: string, sig: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.concat([Buffer.from(targetPubkey, "hex"), Buffer.from([isFollow ? 0x01 : 0x00])]);
  verifyV1Schnorr(pubkeyBuf, KIND_FOLLOW, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_FOLLOW, kindData);
}

export function buildPayloadProfileV1(propertyKind: number, value: string, pubkey: string, sig: string): string[] {
  const pubkeyBuf = Buffer.from(pubkey, "hex");
  const kindData = Buffer.concat([Buffer.from([propertyKind]), Buffer.from(value, "utf8")]);
  verifyV1Schnorr(pubkeyBuf, KIND_PROFILE_UPDATE, kindData, sig);
  return buildV1ChunkHexes(pubkeyBuf, sig, KIND_PROFILE_UPDATE, kindData);
}
