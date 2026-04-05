import crypto from "node:crypto";
import * as tinysecp from "tiny-secp256k1";
import {
  parseORSPayload,
  parseV1Chunk,
  assembleV1Body,
  buildV1SigningBody,
  bytesToHex,
  KIND_TEXT_NOTE,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
  PROFILE_PROPERTY_NAME,
  PROFILE_PROPERTY_AVATAR_URL,
  PROFILE_PROPERTY_BIO,
  PROFILE_PROPERTY_BOT,
  getUnsignedBytes,
} from "@opreturnsocial/protocol";
import type {
  OrsPost,
  OrsProfileUpdate,
  OrsTextReply,
  OrsRepost,
  OrsQuoteRepost,
  OrsFollow,
} from "@opreturnsocial/protocol";

interface DecodedEvent {
  txid: string;
  network: string;
  pubkey: string;
  sig: string;
  blockHeight: number;
  timestamp: number;
  kind: number;
  content?: string;
  parentTxid?: string;
  propertyKind?: number;
  propertyValue?: string;
  targetPubkey?: string;
  isFollow?: boolean;
}
import { prisma } from "./db.js";
import { mainnetRpc, freeNetworkRpc, RpcError, type RpcClient } from "./rpc.js";

const FREE_NETWORK = process.env.FREE_NETWORK ?? "mutinynet";

const V1_CHUNK_WINDOW = 6;
// Bitcoin RPC error code for "No such mempool or blockchain transaction"
const RPC_TX_NOT_FOUND = -5;
const POLL_INTERVAL_MS = 5000;

function extractPayloadFromScript(hex: string): Buffer | null {
  const buf = Buffer.from(hex, "hex");
  if (buf.length < 2) return null;
  if (buf[0] !== 0x6a) return null;

  const pushOpcode = buf[1];
  if (pushOpcode >= 0x01 && pushOpcode <= 0x4b) return buf.subarray(2);
  if (pushOpcode === 0x4c) {
    if (buf.length < 3) return null;
    return buf.subarray(3);
  }
  if (pushOpcode === 0x4d) {
    if (buf.length < 4) return null;
    return buf.subarray(4);
  }
  return null;
}

async function getOrCreateScannerState(network: string): Promise<number> {
  const startBlockEnv =
    network !== "mainnet"
      ? process.env.FREE_NETWORK_START_BLOCK
      : process.env.START_BLOCK;
  const startBlock = parseInt(startBlockEnv ?? "0", 10) || 0;
  const state = await prisma.scannerState.upsert({
    where: { network },
    create: { network, lastBlock: startBlock },
    update: {},
  });
  return state.lastBlock;
}

async function createNotification(
  recipientPubkey: string,
  actorPubkey: string,
  kind: number,
  txid: string,
  network: string,
  timestamp: number,
): Promise<void> {
  if (recipientPubkey === actorPubkey) return;
  console.log(
    `[scanner:${network}] creating notification ${txid} from ${actorPubkey} to ${recipientPubkey}`,
  );
  await prisma.notification.upsert({
    where: { txid_network: { txid, network } },
    create: { recipientPubkey, actorPubkey, kind, txid, network, timestamp },
    update: {},
  });
}

function normalizeV0(
  post: OrsPost | OrsTextReply | OrsRepost | OrsQuoteRepost | OrsProfileUpdate | OrsFollow,
  txid: string,
  network: string,
  blockHeight: number,
  timestamp: number,
): DecodedEvent | null {
  const base = { txid, network, pubkey: post.pubkey, sig: post.sig, blockHeight, timestamp, kind: post.kind };
  switch (post.kind) {
    case KIND_TEXT_NOTE:
      return { ...base, content: (post as OrsPost).content };
    case KIND_TEXT_REPLY: {
      const r = post as OrsTextReply;
      return { ...base, content: r.content, parentTxid: r.parentTxid };
    }
    case KIND_REPOST:
      return { ...base, parentTxid: (post as OrsRepost).referencedTxid };
    case KIND_QUOTE_REPOST: {
      const q = post as OrsQuoteRepost;
      return { ...base, content: q.content, parentTxid: q.referencedTxid };
    }
    case KIND_PROFILE_UPDATE: {
      const u = post as OrsProfileUpdate;
      return { ...base, propertyKind: u.propertyKind, propertyValue: u.content };
    }
    case KIND_FOLLOW: {
      const f = post as OrsFollow;
      return { ...base, targetPubkey: f.targetPubkey, isFollow: f.isFollow };
    }
    default:
      return null;
  }
}

function normalizeV1(
  txid: string,
  network: string,
  pubkey: Uint8Array,
  sig: Uint8Array,
  kind: number,
  kindData: Uint8Array,
  blockHeight: number,
  timestamp: number,
): DecodedEvent | null {
  const pubkeyHex = bytesToHex(pubkey);
  const sigHex = bytesToHex(sig);
  const base = { txid, network, pubkey: pubkeyHex, sig: sigHex, blockHeight, timestamp, kind };
  switch (kind) {
    case KIND_TEXT_NOTE:
      return { ...base, content: new TextDecoder().decode(kindData) };
    case KIND_TEXT_REPLY: {
      if (kindData.length < 32) return null;
      return {
        ...base,
        parentTxid: bytesToHex(kindData.subarray(0, 32)),
        content: new TextDecoder().decode(kindData.subarray(32)),
      };
    }
    case KIND_REPOST: {
      if (kindData.length < 32) return null;
      return { ...base, parentTxid: bytesToHex(kindData.subarray(0, 32)) };
    }
    case KIND_QUOTE_REPOST: {
      if (kindData.length < 32) return null;
      return {
        ...base,
        parentTxid: bytesToHex(kindData.subarray(0, 32)),
        content: new TextDecoder().decode(kindData.subarray(32)),
      };
    }
    case KIND_PROFILE_UPDATE: {
      if (kindData.length < 1) return null;
      return {
        ...base,
        propertyKind: kindData[0],
        propertyValue: new TextDecoder().decode(kindData.subarray(1)),
      };
    }
    case KIND_FOLLOW: {
      if (kindData.length < 33) return null;
      return {
        ...base,
        targetPubkey: bytesToHex(kindData.subarray(0, 32)),
        isFollow: kindData[32] === 0x01,
      };
    }
    default:
      return null;
  }
}

async function processDecodedEvent(event: DecodedEvent): Promise<void> {
  const { txid, network, pubkey, sig, blockHeight, timestamp, kind } = event;

  if (kind === KIND_TEXT_NOTE) {
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: { txid, network, blockHeight, timestamp, content: event.content!, kind, pubkey, sig, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] TEXT_NOTE ${txid}`);

  } else if (kind === KIND_TEXT_REPLY) {
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: { txid, network, blockHeight, timestamp, content: event.content!, kind, pubkey, sig, parentTxid: event.parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] TEXT_REPLY ${txid}`);
    const parent = await prisma.post.findFirst({
      where: { txid: event.parentTxid!, network: { in: ["mainnet", FREE_NETWORK] } },
      select: { pubkey: true },
    });
    if (parent) await createNotification(parent.pubkey, pubkey, kind, txid, network, timestamp);

  } else if (kind === KIND_REPOST) {
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: { txid, network, blockHeight, timestamp, content: "", kind, pubkey, sig, parentTxid: event.parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] REPOST ${txid}`);
    const parent = await prisma.post.findFirst({
      where: { txid: event.parentTxid!, network: { in: ["mainnet", FREE_NETWORK] } },
      select: { pubkey: true },
    });
    if (parent) await createNotification(parent.pubkey, pubkey, kind, txid, network, timestamp);

  } else if (kind === KIND_QUOTE_REPOST) {
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: { txid, network, blockHeight, timestamp, content: event.content!, kind, pubkey, sig, parentTxid: event.parentTxid, status: "confirmed" },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] QUOTE_REPOST ${txid}`);
    const parent = await prisma.post.findFirst({
      where: { txid: event.parentTxid!, network: { in: ["mainnet", FREE_NETWORK] } },
      select: { pubkey: true },
    });
    if (parent) await createNotification(parent.pubkey, pubkey, kind, txid, network, timestamp);

  } else if (kind === KIND_PROFILE_UPDATE) {
    const propertyKind = event.propertyKind!;
    const propertyValue = event.propertyValue!;
    const data: { name?: string; avatarUrl?: string; bio?: string; bot?: boolean } = {};
    if (propertyKind === PROFILE_PROPERTY_NAME) data.name = propertyValue;
    else if (propertyKind === PROFILE_PROPERTY_AVATAR_URL) data.avatarUrl = propertyValue;
    else if (propertyKind === PROFILE_PROPERTY_BIO) data.bio = propertyValue;
    else if (propertyKind === PROFILE_PROPERTY_BOT) data.bot = propertyValue === "true";
    if (Object.keys(data).length > 0) {
      await prisma.profile.upsert({
        where: { pubkey_network: { pubkey, network } },
        create: { pubkey, network, ...data, status: "confirmed" },
        update: { ...data, status: "confirmed" },
      });
      await prisma.profileUpdateEvent.upsert({
        where: { txid_network: { txid, network } },
        create: { txid, network, pubkey, propertyKind, value: propertyValue, blockHeight, timestamp, status: "confirmed", sig },
        update: { blockHeight, timestamp, status: "confirmed", sig },
      });
      console.log(`[scanner:${network}] PROFILE_UPDATE ${pubkey.slice(0, 8)}… property=${propertyKind}`);
    }

  } else if (kind === KIND_FOLLOW) {
    await prisma.follow.upsert({
      where: { followerPubkey_followeePubkey_network: { followerPubkey: pubkey, followeePubkey: event.targetPubkey!, network } },
      create: { followerPubkey: pubkey, followeePubkey: event.targetPubkey!, network, isFollow: event.isFollow!, txid, blockHeight, timestamp, status: "confirmed", sig },
      update: { isFollow: event.isFollow!, txid, blockHeight, status: "confirmed", sig },
    });
    console.log(`[scanner:${network}] FOLLOW ${pubkey.slice(0, 8)}… -> ${event.targetPubkey!.slice(0, 8)}… isFollow=${event.isFollow}`);
    if (event.isFollow) {
      await createNotification(event.targetPubkey!, pubkey, kind, txid, network, timestamp);
    }
  }
}

async function hasMainnetActivity(pubkey: string): Promise<boolean> {
  const [post, profile] = await Promise.all([
    prisma.post.findFirst({
      where: { pubkey, network: "mainnet", status: "confirmed" },
    }),
    prisma.profile.findFirst({
      where: { pubkey, network: "mainnet", status: "confirmed" },
    }),
  ]);
  return post !== null || profile !== null;
}

async function scanBlock(
  height: number,
  network: string,
  rpc: RpcClient,
): Promise<void> {
  const hash = await rpc.getBlockHash(height);
  const block = await rpc.getBlock(hash);

  await prisma.scannedBlock.upsert({
    where: { height_network: { height, network } },
    create: { height, network, hash },
    update: { hash },
  });

  for (const tx of block.tx) {
    for (const vout of tx.vout) {
      const asm = vout.scriptPubKey.asm;
      if (!asm.startsWith("OP_RETURN")) continue;

      const payload = extractPayloadFromScript(vout.scriptPubKey.hex);
      if (!payload) continue;

      // v1 chunk
      if (payload.length >= 4 && payload[3] === 0x01) {
        const chunk = parseV1Chunk(payload);
        if (!chunk) continue;
        await prisma.pendingChunk.upsert({
          where: { txid_network: { txid: tx.txid, network } },
          create: {
            txid: tx.txid,
            network,
            chunkNum: chunk.chunkNum,
            totalChunks: chunk.totalChunks ?? null,
            bodySlice: bytesToHex(chunk.bodySlice),
            blockHeight: height,
            timestamp: block.time,
          },
          update: { blockHeight: height, timestamp: block.time },
        });
        console.log(
          `[scanner:${network}] v1 chunk ${chunk.chunkNum} in block ${height}: ${tx.txid}`,
        );
        continue;
      }

      const result = parseORSPayload(payload);
      if (!result.supported) continue;

      // Free network mainnet-activity gate (disabled)
      /*if (network !== "mainnet") {
        const active = await hasMainnetActivity(result.post.pubkey);
        if (!active) {
          console.log(
            `[scanner:${network}] Skipping TX ${tx.txid}: pubkey ${result.post.pubkey.slice(0, 8)}… has no mainnet activity`,
          );
          continue;
        }
      }*/

      const unsignedBytes = getUnsignedBytes(payload);
      const msgHash = crypto
        .createHash("sha256")
        .update(unsignedBytes)
        .digest();
      const valid = tinysecp.verifySchnorr(
        msgHash,
        Buffer.from(result.post.pubkey, "hex"),
        Buffer.from(result.post.sig, "hex"),
      );
      if (!valid) {
        console.warn(
          `[scanner:${network}] Invalid sig in ${tx.txid}, skipping`,
        );
        continue;
      }

      const event = normalizeV0(result.post, tx.txid, network, height, block.time);
      if (event) await processDecodedEvent(event);
    }
  }

  await prisma.scannerState.upsert({
    where: { network },
    create: { network, lastBlock: height },
    update: { lastBlock: height },
  });
}

async function checkReorg(network: string, rpc: RpcClient): Promise<void> {
  const lastBlock = await getOrCreateScannerState(network);
  if (lastBlock === 0) return;

  const checkFrom = Math.max(1, lastBlock - 5);
  const stored = await prisma.scannedBlock.findMany({
    where: { height: { gte: checkFrom }, network },
    orderBy: { height: "asc" },
  });

  for (const record of stored) {
    const currentHash = await rpc.getBlockHash(record.height);
    if (currentHash !== record.hash) {
      console.log(
        `[scanner:${network}] Re-org detected at height ${record.height}`,
      );
      await prisma.scannedBlock.deleteMany({
        where: { height: { gte: record.height }, network },
      });
      await prisma.post.updateMany({
        where: {
          blockHeight: { gte: record.height },
          status: "confirmed",
          network,
        },
        data: { status: "pending", blockHeight: 0 },
      });
      await prisma.follow.updateMany({
        where: {
          blockHeight: { gte: record.height },
          status: "confirmed",
          network,
        },
        data: { status: "pending", blockHeight: 0 },
      });
      await prisma.profileUpdateEvent.updateMany({
        where: {
          blockHeight: { gte: record.height },
          status: "confirmed",
          network,
        },
        data: { status: "pending", blockHeight: 0 },
      });
      // TODO: handle notifications
      await prisma.scannerState.upsert({
        where: { network },
        update: { lastBlock: record.height - 1 },
        create: { network, lastBlock: record.height - 1 },
      });
      break;
    }
  }
}

async function checkMempoolEvictions(
  network: string,
  rpc: RpcClient,
): Promise<void> {
  const pendingOrEvictedPosts = await prisma.post.findMany({
    where: { status: { in: ["pending", "evicted"] }, network },
  });
  for (const post of pendingOrEvictedPosts) {
    try {
      const tx = await rpc.getRawTransaction(post.txid);
      if (tx.confirmations && tx.confirmations > 0) {
        await prisma.post.update({
          where: { txid_network: { txid: post.txid, network } },
          data: {
            status: "confirmed",
            blockHeight: tx.blockheight,
            timestamp: tx.blocktime,
          },
        });
      }
    } catch (err) {
      if (err instanceof RpcError && err.code === RPC_TX_NOT_FOUND) {
        if (post.status !== "evicted") {
          await prisma.post.update({
            where: { txid_network: { txid: post.txid, network } },
            data: { status: "evicted" },
          });
          console.log(`[scanner:${network}] Post evicted: ${post.txid}`);
        }
      } else {
        console.error(
          `[scanner:${network}] Error checking post ${post.txid}:`,
          err,
        );
      }
    }
  }

  const pendingOrEvictedProfileUpdates =
    await prisma.profileUpdateEvent.findMany({
      where: { status: { in: ["pending", "evicted"] }, network },
    });
  for (const evt of pendingOrEvictedProfileUpdates) {
    try {
      const tx = await rpc.getRawTransaction(evt.txid);
      if (tx.confirmations && tx.confirmations > 0) {
        await prisma.profileUpdateEvent.update({
          where: { txid_network: { txid: evt.txid, network } },
          data: {
            status: "confirmed",
            blockHeight: tx.blockheight,
            timestamp: tx.blocktime,
          },
        });
      }
    } catch (err) {
      if (err instanceof RpcError && err.code === RPC_TX_NOT_FOUND) {
        if (evt.status !== "evicted") {
          await prisma.profileUpdateEvent.update({
            where: { txid_network: { txid: evt.txid, network } },
            data: { status: "evicted" },
          });
          console.log(
            `[scanner:${network}] ProfileUpdateEvent evicted: ${evt.txid}`,
          );
        }
      } else {
        console.error(
          `[scanner:${network}] Error checking profileUpdateEvent ${evt.txid}:`,
          err,
        );
      }
    }
  }

  const pendingOrEvictedFollows = await prisma.follow.findMany({
    where: { status: { in: ["pending", "evicted"] }, network },
  });
  for (const follow of pendingOrEvictedFollows) {
    try {
      const tx = await rpc.getRawTransaction(follow.txid);
      if (tx.confirmations && tx.confirmations > 0) {
        await prisma.follow.update({
          where: {
            followerPubkey_followeePubkey_network: {
              followerPubkey: follow.followerPubkey,
              followeePubkey: follow.followeePubkey,
              network,
            },
          },
          data: {
            status: "confirmed",
            blockHeight: tx.blockheight,
            timestamp: tx.blocktime,
          },
        });
      }
    } catch (err) {
      if (err instanceof RpcError && err.code === RPC_TX_NOT_FOUND) {
        if (follow.status !== "evicted") {
          await prisma.follow.update({
            where: {
              followerPubkey_followeePubkey_network: {
                followerPubkey: follow.followerPubkey,
                followeePubkey: follow.followeePubkey,
                network,
              },
            },
            data: { status: "evicted" },
          });
          console.log(`[scanner:${network}] Follow evicted: ${follow.txid}`);
        }
      } else {
        console.error(
          `[scanner:${network}] Error checking follow ${follow.txid}:`,
          err,
        );
      }
    }
  }
}

function* cartesianProduct<T>(arrays: T[][]): Generator<T[]> {
  if (arrays.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = arrays;
  for (const a of first) {
    for (const combo of cartesianProduct(rest)) {
      yield [a, ...combo];
    }
  }
}

async function assembleV1Chunks(
  currentHeight: number,
  network: string,
): Promise<void> {
  const minHeight = currentHeight - V1_CHUNK_WINDOW + 1;
  const windowChunks = await prisma.pendingChunk.findMany({
    where: { blockHeight: { gte: minHeight }, network },
  });

  const chunk0s = windowChunks.filter(
    (c) => c.chunkNum === 0 && c.totalChunks !== null,
  );

  for (const c0 of chunk0s) {
    const totalChunks = c0.totalChunks!;
    const candidates: Uint8Array[][] = [[Buffer.from(c0.bodySlice, "hex")]];
    for (let n = 1; n < totalChunks; n++) {
      const cands = windowChunks
        .filter((c) => c.chunkNum === n)
        .map((c) => Buffer.from(c.bodySlice, "hex"));
      if (cands.length === 0) break;
      candidates.push(cands);
    }
    if (candidates.length !== totalChunks) continue;

    for (const combo of cartesianProduct(candidates)) {
      const assembled = assembleV1Body(combo);
      if (!assembled) continue;

      const signingBody = buildV1SigningBody(
        assembled.pubkey,
        assembled.kind,
        assembled.kindData,
      );
      const msgHash = crypto.createHash("sha256").update(signingBody).digest();
      const valid = tinysecp.verifySchnorr(
        msgHash,
        assembled.pubkey,
        assembled.sig,
      );
      if (!valid) continue;

      // Free network mainnet-activity gate for v1 assembled posts
      /*if (network !== "mainnet") {
        const pubkeyHex = bytesToHex(assembled.pubkey);
        const active = await hasMainnetActivity(pubkeyHex);
        if (!active) {
          console.log(
            `[scanner:${network}] Skipping v1 TX ${c0.txid}: no mainnet activity for pubkey`,
          );
          break;
        }
      }*/

      const event = normalizeV1(c0.txid, network, assembled.pubkey, assembled.sig, assembled.kind, assembled.kindData, c0.blockHeight, c0.timestamp);
      if (event) await processDecodedEvent(event);

      const assembledTxids = [c0.txid];
      for (let n = 1; n < totalChunks; n++) {
        const sliceHex = bytesToHex(combo[n]);
        const matched = windowChunks.find(
          (c) => c.chunkNum === n && c.bodySlice === sliceHex,
        );
        if (matched) assembledTxids.push(matched.txid);
      }
      await prisma.pendingChunk.deleteMany({
        where: { txid: { in: assembledTxids }, network },
      });
      break;
    }
  }

  await prisma.pendingChunk.deleteMany({
    where: { blockHeight: { lt: minHeight }, network },
  });
}

async function runScanCycle(network: string, rpc: RpcClient): Promise<void> {
  try {
    await checkReorg(network, rpc);
    const lastBlock = await getOrCreateScannerState(network);
    const tip = await rpc.getBlockCount();
    for (let height = lastBlock + 1; height <= tip; height++) {
      await scanBlock(height, network, rpc);
      await assembleV1Chunks(height, network);
    }
    await checkMempoolEvictions(network, rpc);
  } catch (err) {
    console.error(`[scanner:${network}] Error during scan cycle:`, err);
  }
}

export function startScanner(): void {
  const networks: Array<{ network: string; rpc: RpcClient }> = [
    { network: "mainnet", rpc: mainnetRpc },
  ];
  if (process.env.FREE_NETWORK_BITCOIN_RPC_HOST) {
    networks.push({ network: FREE_NETWORK, rpc: freeNetworkRpc });
  }

  console.log(
    `[scanner] Starting scanner for networks: ${networks.map((n) => n.network).join(", ")} (5s polling)`,
  );

  void (async () => {
    while (true) {
      for (const { network, rpc } of networks) {
        await runScanCycle(network, rpc);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  })();
}

export async function rescanFrom(
  fromBlock: number,
  network = "mainnet",
): Promise<void> {
  await prisma.scannedBlock.deleteMany({
    where: { height: { gte: fromBlock }, network },
  });
  await prisma.post.updateMany({
    where: {
      OR: [{ blockHeight: { gte: fromBlock } }, { blockHeight: 0 }],
      network,
    },
    data: { status: "pending", blockHeight: 0 },
  });
  await prisma.follow.updateMany({
    where: {
      OR: [{ blockHeight: { gte: fromBlock } }, { blockHeight: 0 }],
      network,
    },
    data: { status: "pending", blockHeight: 0 },
  });
  await prisma.profileUpdateEvent.updateMany({
    where: {
      OR: [{ blockHeight: { gte: fromBlock } }, { blockHeight: 0 }],
      network,
    },
    data: { status: "pending", blockHeight: 0 },
  });
  await prisma.scannerState.upsert({
    where: { network },
    create: { network, lastBlock: Math.max(0, fromBlock - 1) },
    update: { lastBlock: Math.max(0, fromBlock - 1) },
  });
  console.log(`[scanner:${network}] Rescan requested from block ${fromBlock}`);
}
