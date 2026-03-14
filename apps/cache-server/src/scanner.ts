import crypto from "node:crypto";
import * as tinysecp from "tiny-secp256k1";
import {
  parseORSPayload,
  parseV1Chunk,
  assembleV1Body,
  buildV1SigningBody,
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROPERTY_NAME,
  PROPERTY_AVATAR_URL,
  PROPERTY_BIO,
  getUnsignedBytes,
} from "@ors/protocol";
import type { OrsProfileUpdate, OrsTextReply, OrsRepost, OrsQuoteRepost, OrsFollow } from "@ors/protocol";
import { prisma } from "./db.js";
import { getBlockCount, getBlockHash, getBlock, getMempoolEntry, getRawTransaction } from "./rpc.js";

// How many blocks back to keep pending v1 chunks
const V1_CHUNK_WINDOW = 6;

const POLL_INTERVAL_MS = 5000;

/**
 * Strip OP_RETURN prefix from script hex to get the raw payload.
 *
 * OP_RETURN = 6a
 * Then a push opcode:
 *   0x01–0x4b: direct push (N bytes follow), skip 1 byte
 *   0x4c: OP_PUSHDATA1, length in next byte, skip 2 bytes
 *   0x4d: OP_PUSHDATA2, length in next 2 bytes, skip 3 bytes
 */
function extractPayloadFromScript(hex: string): Buffer | null {
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 2) return null;
  if (buf[0] !== 0x6a) return null; // not OP_RETURN

  const pushOpcode = buf[1];

  if (pushOpcode >= 0x01 && pushOpcode <= 0x4b) {
    // Direct push: opcode is the length
    return buf.subarray(2);
  } else if (pushOpcode === 0x4c) {
    // OP_PUSHDATA1: next byte is length
    if (buf.length < 3) return null;
    return buf.subarray(3);
  } else if (pushOpcode === 0x4d) {
    // OP_PUSHDATA2: next 2 bytes are length (little-endian)
    if (buf.length < 4) return null;
    return buf.subarray(4);
  } else if (pushOpcode === 0x00) {
    // OP_RETURN with no data (OP_RETURN OP_0)
    return null;
  }

  return null;
}

async function getOrCreateScannerState(): Promise<number> {
  const startBlock = parseInt(process.env.START_BLOCK ?? "0", 10) || 0;
  const state = await prisma.scannerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: startBlock },
    update: {},
  });
  return state.lastBlock;
}

async function scanBlock(height: number): Promise<void> {
  const hash = await getBlockHash(height);
  const block = await getBlock(hash);

  await prisma.scannedBlock.upsert({
    where: { height },
    create: { height, hash },
    update: { hash },
  });

  for (const tx of block.tx) {
    for (const vout of tx.vout) {
      const asm = vout.scriptPubKey.asm;
      if (!asm.startsWith("OP_RETURN")) continue;

      const payload = extractPayloadFromScript(vout.scriptPubKey.hex);
      if (!payload) continue;

      // Detect version byte to route to v0 or v1 parser
      if (payload.length >= 4 && payload[3] === 0x01) {
        // v1 chunk
        const chunk = parseV1Chunk(payload);
        if (!chunk) continue;
        await prisma.pendingChunk.upsert({
          where: { txid: tx.txid },
          create: {
            txid: tx.txid,
            chunkNum: chunk.chunkNum,
            totalChunks: chunk.totalChunks ?? null,
            bodySlice: chunk.bodySlice.toString("hex"),
            blockHeight: height,
            timestamp: block.time,
          },
          update: {
            blockHeight: height,
            timestamp: block.time,
          },
        });
        console.log(`[scanner] v1 chunk ${chunk.chunkNum} in block ${height}: ${tx.txid}`);
        continue;
      }

      const result = parseORSPayload(payload);
      if (!result.supported) continue;

      const unsignedBytes = getUnsignedBytes(payload);
      const msgHash = crypto.createHash("sha256").update(unsignedBytes).digest();
      const valid = tinysecp.verifySchnorr(
        msgHash,
        Buffer.from(result.post.pubkey, "hex"),
        Buffer.from(result.post.sig, "hex")
      );
      if (!valid) {
        console.warn(`[scanner] Invalid sig in ${tx.txid}, skipping`);
        continue;
      }

      if (result.post.kind === KIND_TEXT_NOTE) {
        await prisma.post.upsert({
          where: { txid: tx.txid },
          create: {
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            content: result.post.content,
            kind: result.post.kind,
            pubkey: result.post.pubkey,
            sig: result.post.sig,
            status: "confirmed",
          },
          update: {
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
          },
        });
        console.log(`[scanner] Found ORS post in block ${height}: ${tx.txid}`);
      } else if (result.post.kind === KIND_TEXT_REPLY) {
        const reply = result.post as OrsTextReply;
        await prisma.post.upsert({
          where: { txid: tx.txid },
          create: {
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            content: reply.content,
            kind: reply.kind,
            pubkey: reply.pubkey,
            sig: reply.sig,
            parentTxid: reply.parentTxid,
            status: "confirmed",
          },
          update: {
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
          },
        });
        console.log(`[scanner] Found ORS reply in block ${height}: ${tx.txid} -> ${reply.parentTxid.slice(0, 8)}…`);
      } else if (result.post.kind === KIND_REPOST) {
        const repost = result.post as OrsRepost;
        await prisma.post.upsert({
          where: { txid: tx.txid },
          create: {
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            content: "",
            kind: repost.kind,
            pubkey: repost.pubkey,
            sig: repost.sig,
            parentTxid: repost.referencedTxid,
            status: "confirmed",
          },
          update: {
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
          },
        });
        console.log(`[scanner] Found ORS repost in block ${height}: ${tx.txid} -> ${repost.referencedTxid.slice(0, 8)}…`);
      } else if (result.post.kind === KIND_QUOTE_REPOST) {
        const quote = result.post as OrsQuoteRepost;
        await prisma.post.upsert({
          where: { txid: tx.txid },
          create: {
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            content: quote.content,
            kind: quote.kind,
            pubkey: quote.pubkey,
            sig: quote.sig,
            parentTxid: quote.referencedTxid,
            status: "confirmed",
          },
          update: {
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
          },
        });
        console.log(`[scanner] Found ORS quote-repost in block ${height}: ${tx.txid} -> ${quote.referencedTxid.slice(0, 8)}…`);
      } else if (result.post.kind === KIND_PROFILE_UPDATE) {
        const update = result.post as OrsProfileUpdate;
        const data: { name?: string; avatarUrl?: string; bio?: string } = {};
        if (update.propertyKind === PROPERTY_NAME) data.name = update.content;
        else if (update.propertyKind === PROPERTY_AVATAR_URL) data.avatarUrl = update.content;
        else if (update.propertyKind === PROPERTY_BIO) data.bio = update.content;

        if (Object.keys(data).length > 0) {
          await prisma.profile.upsert({
            where: { pubkey: update.pubkey },
            create: { pubkey: update.pubkey, ...data, status: "confirmed" },
            update: { ...data, status: "confirmed" },
          });
          console.log(`[scanner] Profile update in block ${height}: ${update.pubkey.slice(0, 8)}… property=${update.propertyKind}`);
        }
      } else if (result.post.kind === KIND_FOLLOW) {
        const follow = result.post as OrsFollow;
        await prisma.follow.upsert({
          where: { followerPubkey_followeePubkey: { followerPubkey: follow.pubkey, followeePubkey: follow.targetPubkey } },
          create: {
            followerPubkey: follow.pubkey,
            followeePubkey: follow.targetPubkey,
            isFollow: follow.isFollow,
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
          },
          update: {
            isFollow: follow.isFollow,
            txid: tx.txid,
            blockHeight: height,
            status: "confirmed",
          },
        });
        console.log(`[scanner] Follow in block ${height}: ${follow.pubkey.slice(0, 8)}… -> ${follow.targetPubkey.slice(0, 8)}… isFollow=${follow.isFollow}`);
      }
    }
  }

  await prisma.scannerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: height },
    update: { lastBlock: height },
  });
}

async function checkReorg(): Promise<void> {
  const lastBlock = await getOrCreateScannerState();
  if (lastBlock === 0) return;

  const checkFrom = Math.max(1, lastBlock - 5);
  const stored = await prisma.scannedBlock.findMany({
    where: { height: { gte: checkFrom } },
    orderBy: { height: "asc" },
  });

  for (const record of stored) {
    const currentHash = await getBlockHash(record.height);
    if (currentHash !== record.hash) {
      console.log(`[scanner] Re-org detected at height ${record.height}`);
      await prisma.scannedBlock.deleteMany({ where: { height: { gte: record.height } } });
      await prisma.post.updateMany({
        where: { blockHeight: { gte: record.height }, status: "confirmed" },
        data: { status: "pending", blockHeight: 0 },
      });
      await prisma.follow.updateMany({
        where: { blockHeight: { gte: record.height }, status: "confirmed" },
        data: { status: "pending", blockHeight: 0 },
      });
      await prisma.scannerState.upsert({
        where: { id: 1 },
        update: { lastBlock: record.height - 1 },
        create: { id: 1, lastBlock: record.height - 1 },
      });
      break;
    }
  }
}

async function checkMempoolEvictions(): Promise<void> {
  const pending = await prisma.post.findMany({ where: { status: "pending" } });
  for (const post of pending) {
    try {
      await getMempoolEntry(post.txid);
    } catch {
      await prisma.post.update({
        where: { txid: post.txid },
        data: { status: "evicted" },
      });
      console.log(`[scanner] Post evicted: ${post.txid}`);
    }
  }

  const pendingOrEvictedFollows = await prisma.follow.findMany({ where: { status: { in: ["pending", "evicted"] } } });
  for (const follow of pendingOrEvictedFollows) {
    try {
      const tx = await getRawTransaction(follow.txid);
      if (tx.confirmations && tx.confirmations > 0) {
        await prisma.follow.update({
          where: { followerPubkey_followeePubkey: { followerPubkey: follow.followerPubkey, followeePubkey: follow.followeePubkey } },
          data: { status: "confirmed" },
        });
        console.log(`[scanner] Follow confirmed: ${follow.txid}`);
      }
      // confirmations === 0: still in mempool, keep pending
    } catch {
      // tx not found at all → truly evicted
      if (follow.status !== "evicted") {
        await prisma.follow.update({
          where: { followerPubkey_followeePubkey: { followerPubkey: follow.followerPubkey, followeePubkey: follow.followeePubkey } },
          data: { status: "evicted" },
        });
        console.log(`[scanner] Follow evicted: ${follow.txid}`);
      }
    }
  }
}

async function storeV1Post(
  txid: string,
  pubkey: Buffer,
  sig: Buffer,
  kind: number,
  kindData: Buffer,
  blockHeight: number,
  timestamp: number
): Promise<void> {
  const pubkeyHex = pubkey.toString("hex");
  const sigHex = sig.toString("hex");

  if (kind === KIND_TEXT_NOTE) {
    const content = kindData.toString("utf8");
    await prisma.post.upsert({
      where: { txid },
      create: { txid, blockHeight, timestamp, content, kind, pubkey: pubkeyHex, sig: sigHex, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner] v1 assembled TEXT_NOTE ${txid}`);
  } else if (kind === KIND_TEXT_REPLY) {
    if (kindData.length < 32) return;
    const parentTxid = kindData.subarray(0, 32).toString("hex");
    const content = kindData.subarray(32).toString("utf8");
    await prisma.post.upsert({
      where: { txid },
      create: { txid, blockHeight, timestamp, content, kind, pubkey: pubkeyHex, sig: sigHex, parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner] v1 assembled TEXT_REPLY ${txid} -> ${parentTxid.slice(0, 8)}…`);
  } else if (kind === KIND_REPOST) {
    if (kindData.length < 32) return;
    const parentTxid = kindData.subarray(0, 32).toString("hex");
    await prisma.post.upsert({
      where: { txid },
      create: { txid, blockHeight, timestamp, content: "", kind, pubkey: pubkeyHex, sig: sigHex, parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner] v1 assembled REPOST ${txid} -> ${parentTxid.slice(0, 8)}…`);
  } else if (kind === KIND_QUOTE_REPOST) {
    if (kindData.length < 32) return;
    const parentTxid = kindData.subarray(0, 32).toString("hex");
    const content = kindData.subarray(32).toString("utf8");
    await prisma.post.upsert({
      where: { txid },
      create: { txid, blockHeight, timestamp, content, kind, pubkey: pubkeyHex, sig: sigHex, parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner] v1 assembled QUOTE_REPOST ${txid} -> ${parentTxid.slice(0, 8)}…`);
  } else if (kind === KIND_PROFILE_UPDATE) {
    if (kindData.length < 1) return;
    const propertyKind = kindData[0];
    const valueBytes = kindData.subarray(1);
    const data: { name?: string; avatarUrl?: string; bio?: string } = {};
    if (propertyKind === PROPERTY_NAME) data.name = valueBytes.toString("utf8");
    else if (propertyKind === PROPERTY_AVATAR_URL) data.avatarUrl = valueBytes.toString("utf8");
    else if (propertyKind === PROPERTY_BIO) data.bio = valueBytes.toString("utf8");
    if (Object.keys(data).length > 0) {
      await prisma.profile.upsert({
        where: { pubkey: pubkeyHex },
        create: { pubkey: pubkeyHex, ...data, status: "confirmed" },
        update: { ...data, status: "confirmed" },
      });
      console.log(`[scanner] v1 assembled PROFILE_UPDATE ${pubkeyHex.slice(0, 8)}… property=${propertyKind}`);
    }
  } else if (kind === KIND_FOLLOW) {
    if (kindData.length < 33) return;
    const targetPubkey = kindData.subarray(0, 32).toString("hex");
    const isFollow = kindData[32] === 0x01;
    await prisma.follow.upsert({
      where: { followerPubkey_followeePubkey: { followerPubkey: pubkeyHex, followeePubkey: targetPubkey } },
      create: { followerPubkey: pubkeyHex, followeePubkey: targetPubkey, isFollow, txid, blockHeight, timestamp, status: "confirmed" },
      update: { isFollow, txid, blockHeight, status: "confirmed" },
    });
    console.log(`[scanner] v1 assembled FOLLOW ${pubkeyHex.slice(0, 8)}… -> ${targetPubkey.slice(0, 8)}… isFollow=${isFollow}`);
  }
}

// Cartesian product generator
function* cartesianProduct<T>(arrays: T[][]): Generator<T[]> {
  if (arrays.length === 0) { yield []; return; }
  const [first, ...rest] = arrays;
  for (const a of first) {
    for (const combo of cartesianProduct(rest)) {
      yield [a, ...combo];
    }
  }
}

async function assembleV1Chunks(currentHeight: number): Promise<void> {
  const minHeight = currentHeight - V1_CHUNK_WINDOW + 1;
  const windowChunks = await prisma.pendingChunk.findMany({
    where: { blockHeight: { gte: minHeight } },
  });

  const chunk0s = windowChunks.filter((c) => c.chunkNum === 0 && c.totalChunks !== null);

  for (const c0 of chunk0s) {
    const totalChunks = c0.totalChunks!;

    // Collect candidate body slices for each chunk index
    const candidates: Buffer[][] = [[Buffer.from(c0.bodySlice, "hex")]];
    for (let n = 1; n < totalChunks; n++) {
      const cands = windowChunks
        .filter((c) => c.chunkNum === n)
        .map((c) => Buffer.from(c.bodySlice, "hex"));
      if (cands.length === 0) break; // missing chunks — skip this c0
      candidates.push(cands);
    }

    if (candidates.length !== totalChunks) continue; // not all chunk indices present

    for (const combo of cartesianProduct(candidates)) {
      const assembled = assembleV1Body(combo);
      if (!assembled) continue;

      // Verify Schnorr signature
      const signingBody = buildV1SigningBody(assembled.pubkey, assembled.kind, assembled.kindData);
      const msgHash = crypto.createHash("sha256").update(signingBody).digest();
      const valid = tinysecp.verifySchnorr(msgHash, assembled.pubkey, assembled.sig);
      if (!valid) continue;

      // Valid! Store the post and clean up assembled chunks
      await storeV1Post(c0.txid, assembled.pubkey, assembled.sig, assembled.kind, assembled.kindData, c0.blockHeight, c0.timestamp);

      // Remove assembled chunks from PendingChunk
      const assembledTxids = [c0.txid];
      // We need to find which windowChunk txids correspond to the combo slices
      // Use a best-effort match: remove all chunks with those body slices and chunk nums
      for (let n = 1; n < totalChunks; n++) {
        const sliceHex = combo[n].toString("hex");
        const matched = windowChunks.find((c) => c.chunkNum === n && c.bodySlice === sliceHex);
        if (matched) assembledTxids.push(matched.txid);
      }
      await prisma.pendingChunk.deleteMany({ where: { txid: { in: assembledTxids } } });
      break;
    }
  }

  // Discard stale chunks outside the window
  await prisma.pendingChunk.deleteMany({ where: { blockHeight: { lt: minHeight } } });
}

async function runScanCycle(): Promise<void> {
  try {
    await checkReorg();
    // Scan new blocks first so confirmed txs are marked "confirmed" before eviction check
    const lastBlock = await getOrCreateScannerState();
    const tip = await getBlockCount();
    for (let height = lastBlock + 1; height <= tip; height++) {
      await scanBlock(height);
    }
    // Attempt to assemble any pending v1 chunks
    const currentHeight = await getBlockCount();
    if (currentHeight > 0) {
      await assembleV1Chunks(currentHeight);
    }
    await checkMempoolEvictions();
  } catch (err) {
    console.error("[scanner] Error during scan cycle:", err);
  }
}

export function startScanner(): void {
  console.log("[scanner] Starting blockchain scanner (5s polling)");
  runScanCycle(); // immediate first run
  setInterval(runScanCycle, POLL_INTERVAL_MS);
}

export async function rescanFrom(fromBlock: number): Promise<void> {
  await prisma.scannedBlock.deleteMany({ where: { height: { gte: fromBlock } } });
  await prisma.post.updateMany({
    where: { OR: [{ blockHeight: { gte: fromBlock } }, { blockHeight: 0 }] },
    data: { status: "pending", blockHeight: 0 },
  });
  await prisma.follow.updateMany({
    where: { OR: [{ blockHeight: { gte: fromBlock } }, { blockHeight: 0 }] },
    data: { status: "pending", blockHeight: 0 },
  });
  await prisma.scannerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastBlock: Math.max(0, fromBlock - 1) },
    update: { lastBlock: Math.max(0, fromBlock - 1) },
  });
  console.log(`[scanner] Rescan requested from block ${fromBlock}`);
}
