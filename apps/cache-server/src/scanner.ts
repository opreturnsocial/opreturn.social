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
  OrsProfileUpdate,
  OrsTextReply,
  OrsRepost,
  OrsQuoteRepost,
  OrsFollow,
} from "@opreturnsocial/protocol";
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

      // Free network mainnet-activity gate
      if (network !== "mainnet") {
        const active = await hasMainnetActivity(result.post.pubkey);
        if (!active) {
          console.log(
            `[scanner:${network}] Skipping TX ${tx.txid}: pubkey ${result.post.pubkey.slice(0, 8)}… has no mainnet activity`,
          );
          continue;
        }
      }

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

      if (result.post.kind === KIND_TEXT_NOTE) {
        await prisma.post.upsert({
          where: { txid_network: { txid: tx.txid, network } },
          create: {
            txid: tx.txid,
            network,
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
        console.log(
          `[scanner:${network}] Found ORS post in block ${height}: ${tx.txid}`,
        );
      } else if (result.post.kind === KIND_TEXT_REPLY) {
        const reply = result.post as OrsTextReply;
        await prisma.post.upsert({
          where: { txid_network: { txid: tx.txid, network } },
          create: {
            txid: tx.txid,
            network,
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
        console.log(
          `[scanner:${network}] Found ORS reply in block ${height}: ${tx.txid}`,
        );
      } else if (result.post.kind === KIND_REPOST) {
        const repost = result.post as OrsRepost;
        await prisma.post.upsert({
          where: { txid_network: { txid: tx.txid, network } },
          create: {
            txid: tx.txid,
            network,
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
        console.log(
          `[scanner:${network}] Found ORS repost in block ${height}: ${tx.txid}`,
        );
      } else if (result.post.kind === KIND_QUOTE_REPOST) {
        const quote = result.post as OrsQuoteRepost;
        await prisma.post.upsert({
          where: { txid_network: { txid: tx.txid, network } },
          create: {
            txid: tx.txid,
            network,
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
        console.log(
          `[scanner:${network}] Found ORS quote-repost in block ${height}: ${tx.txid}`,
        );
      } else if (result.post.kind === KIND_PROFILE_UPDATE) {
        const update = result.post as OrsProfileUpdate;
        const data: {
          name?: string;
          avatarUrl?: string;
          bio?: string;
          bot?: boolean;
        } = {};
        if (update.propertyKind === PROFILE_PROPERTY_NAME)
          data.name = update.content;
        else if (update.propertyKind === PROFILE_PROPERTY_AVATAR_URL)
          data.avatarUrl = update.content;
        else if (update.propertyKind === PROFILE_PROPERTY_BIO)
          data.bio = update.content;
        else if (update.propertyKind === PROFILE_PROPERTY_BOT)
          data.bot = update.content === "true";

        if (Object.keys(data).length > 0) {
          await prisma.profile.upsert({
            where: { pubkey_network: { pubkey: update.pubkey, network } },
            create: {
              pubkey: update.pubkey,
              network,
              ...data,
              status: "confirmed",
            },
            update: { ...data, status: "confirmed" },
          });
          await prisma.profileUpdateEvent.upsert({
            where: { txid_network: { txid: tx.txid, network } },
            create: {
              txid: tx.txid,
              network,
              pubkey: update.pubkey,
              propertyKind: update.propertyKind,
              value: update.content,
              blockHeight: height,
              timestamp: block.time,
              status: "confirmed",
              sig: update.sig,
            },
            update: {
              blockHeight: height,
              timestamp: block.time,
              status: "confirmed",
              sig: update.sig,
            },
          });
          console.log(
            `[scanner:${network}] Profile update in block ${height}: ${update.pubkey.slice(0, 8)}… property=${update.propertyKind}`,
          );
        }
      } else if (result.post.kind === KIND_FOLLOW) {
        const follow = result.post as OrsFollow;
        await prisma.follow.upsert({
          where: {
            followerPubkey_followeePubkey_network: {
              followerPubkey: follow.pubkey,
              followeePubkey: follow.targetPubkey,
              network,
            },
          },
          create: {
            followerPubkey: follow.pubkey,
            followeePubkey: follow.targetPubkey,
            network,
            isFollow: follow.isFollow,
            txid: tx.txid,
            blockHeight: height,
            timestamp: block.time,
            status: "confirmed",
            sig: follow.sig,
          },
          update: {
            isFollow: follow.isFollow,
            txid: tx.txid,
            blockHeight: height,
            status: "confirmed",
            sig: follow.sig,
          },
        });
        console.log(
          `[scanner:${network}] Follow in block ${height}: ${follow.pubkey.slice(0, 8)}… -> ${follow.targetPubkey.slice(0, 8)}… isFollow=${follow.isFollow}`,
        );
      }
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

async function storeV1Post(
  txid: string,
  network: string,
  pubkey: Uint8Array,
  sig: Uint8Array,
  kind: number,
  kindData: Uint8Array,
  blockHeight: number,
  timestamp: number,
): Promise<void> {
  const pubkeyHex = bytesToHex(pubkey);
  const sigHex = bytesToHex(sig);

  if (kind === KIND_TEXT_NOTE) {
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: {
        txid,
        network,
        blockHeight,
        timestamp,
        content: new TextDecoder().decode(kindData),
        kind,
        pubkey: pubkeyHex,
        sig: sigHex,
        status: "confirmed",
      },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] v1 assembled TEXT_NOTE ${txid}`);
  } else if (kind === KIND_TEXT_REPLY) {
    if (kindData.length < 32) return;
    const parentTxid = bytesToHex(kindData.subarray(0, 32));
    const content = new TextDecoder().decode(kindData.subarray(32));
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: {
        txid,
        network,
        blockHeight,
        timestamp,
        content,
        kind,
        pubkey: pubkeyHex,
        sig: sigHex,
        parentTxid,
        status: "confirmed",
      },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] v1 assembled TEXT_REPLY ${txid}`);
  } else if (kind === KIND_REPOST) {
    if (kindData.length < 32) return;
    const parentTxid = bytesToHex(kindData.subarray(0, 32));
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: {
        txid,
        network,
        blockHeight,
        timestamp,
        content: "",
        kind,
        pubkey: pubkeyHex,
        sig: sigHex,
        parentTxid,
        status: "confirmed",
      },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] v1 assembled REPOST ${txid}`);
  } else if (kind === KIND_QUOTE_REPOST) {
    if (kindData.length < 32) return;
    const parentTxid = bytesToHex(kindData.subarray(0, 32));
    const content = new TextDecoder().decode(kindData.subarray(32));
    await prisma.post.upsert({
      where: { txid_network: { txid, network } },
      create: {
        txid,
        network,
        blockHeight,
        timestamp,
        content,
        kind,
        pubkey: pubkeyHex,
        sig: sigHex,
        parentTxid,
        status: "confirmed",
      },
      update: { blockHeight, timestamp, status: "confirmed" },
    });
    console.log(`[scanner:${network}] v1 assembled QUOTE_REPOST ${txid}`);
  } else if (kind === KIND_PROFILE_UPDATE) {
    if (kindData.length < 1) return;
    const propertyKind = kindData[0];
    const valueBytes = kindData.subarray(1);
    const data: { name?: string; avatarUrl?: string; bio?: string } = {};
    if (propertyKind === PROFILE_PROPERTY_NAME)
      data.name = new TextDecoder().decode(valueBytes);
    else if (propertyKind === PROFILE_PROPERTY_AVATAR_URL)
      data.avatarUrl = new TextDecoder().decode(valueBytes);
    else if (propertyKind === PROFILE_PROPERTY_BIO)
      data.bio = new TextDecoder().decode(valueBytes);
    if (Object.keys(data).length > 0) {
      const valueStr = new TextDecoder().decode(valueBytes);
      await prisma.profile.upsert({
        where: { pubkey_network: { pubkey: pubkeyHex, network } },
        create: { pubkey: pubkeyHex, network, ...data, status: "confirmed" },
        update: { ...data, status: "confirmed" },
      });
      await prisma.profileUpdateEvent.upsert({
        where: { txid_network: { txid, network } },
        create: {
          txid,
          network,
          pubkey: pubkeyHex,
          propertyKind,
          value: valueStr,
          blockHeight,
          timestamp,
          status: "confirmed",
        },
        update: { blockHeight, timestamp, status: "confirmed" },
      });
      console.log(
        `[scanner:${network}] v1 assembled PROFILE_UPDATE ${pubkeyHex.slice(0, 8)}… property=${propertyKind}`,
      );
    }
  } else if (kind === KIND_FOLLOW) {
    if (kindData.length < 33) return;
    const targetPubkey = bytesToHex(kindData.subarray(0, 32));
    const isFollow = kindData[32] === 0x01;
    await prisma.follow.upsert({
      where: {
        followerPubkey_followeePubkey_network: {
          followerPubkey: pubkeyHex,
          followeePubkey: targetPubkey,
          network,
        },
      },
      create: {
        followerPubkey: pubkeyHex,
        followeePubkey: targetPubkey,
        network,
        isFollow,
        txid,
        blockHeight,
        timestamp,
        status: "confirmed",
      },
      update: { isFollow, txid, blockHeight, status: "confirmed" },
    });
    console.log(
      `[scanner:${network}] v1 assembled FOLLOW ${pubkeyHex.slice(0, 8)}… -> ${targetPubkey.slice(0, 8)}… isFollow=${isFollow}`,
    );
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

      await storeV1Post(
        c0.txid,
        network,
        assembled.pubkey,
        assembled.sig,
        assembled.kind,
        assembled.kindData,
        c0.blockHeight,
        c0.timestamp,
      );

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
