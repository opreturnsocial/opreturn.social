import express from "express";
import cors from "cors";
import {
  buildPayload,
  buildPayloadProfile,
  buildPayloadReply,
  buildPayloadRepost,
  buildPayloadQuoteRepost,
  buildPayloadFollow,
  buildPayloadV1,
  buildPayloadReplyV1,
  buildPayloadRepostV1,
  buildPayloadQuoteRepostV1,
  buildPayloadFollowV1,
  buildPayloadProfileV1,
} from "./psbt.js";
import {
  generatePreimage,
  createHoldInvoice,
  settleHoldInvoice,
  cancelHoldInvoice,
  subscribeHoldInvoiceAccepted,
} from "./ln.js";
import {
  createRawTransaction,
  fundRawTransactionWithRate,
  signRawTransactionWithWallet,
  sendRawTransaction,
  estimateSmartFee,
  decodeRawTransaction,
  unlockInputs,
  getWalletBalance,
  getRpc,
} from "./rpc.js";
import { prisma } from "./db.js";

const CACHE_SERVER_URL =
  process.env.CACHE_SERVER_URL ?? "http://localhost:3001";
const CACHE_INTERNAL_TOKEN = process.env.CACHE_INTERNAL_TOKEN ?? "";
const FEE_MARKUP_PERCENT = Number(process.env.FEE_MARKUP_PERCENT ?? "10");
const INVOICE_EXPIRY_SECS = Number(process.env.INVOICE_EXPIRY_SECS ?? "600");
const FALLBACK_FEE_RATE_BTC_PER_KB = Number(
  process.env.FALLBACK_FEE_RATE_BTC_PER_KB ?? "0.00001",
);
const FORCE_FEE_RATE_SAT_PER_VBYTE = process.env.FORCE_FEE_RATE_SAT_PER_VBYTE
  ? Number(process.env.FORCE_FEE_RATE_SAT_PER_VBYTE)
  : null;
const FORCE_FEE_RATE_HIGH_SAT_PER_VBYTE = process.env
  .FORCE_FEE_RATE_HIGH_SAT_PER_VBYTE
  ? Number(process.env.FORCE_FEE_RATE_HIGH_SAT_PER_VBYTE)
  : null;
const FORCE_FEE_RATE_MEDIUM_SAT_PER_VBYTE = process.env
  .FORCE_FEE_RATE_MEDIUM_SAT_PER_VBYTE
  ? Number(process.env.FORCE_FEE_RATE_MEDIUM_SAT_PER_VBYTE)
  : null;

// Fee rate caps to protect the facilitator's wallets
const MAX_FEE_RATE_MAINNET_SAT_VBYTE = Number(
  process.env.MAX_FEE_RATE_MAINNET_SAT_VBYTE ?? "10",
);
const MAX_FEE_RATE_FREE_NETWORK_SAT_VBYTE = Number(
  process.env.MAX_FEE_RATE_FREE_NETWORK_SAT_VBYTE ?? "2",
);

// Free network config
const FREE_NETWORK = process.env.FREE_NETWORK ?? "mutinynet";

// Free network rate limits (per rolling 10 minutes)
const FREE_NETWORK_RATE_LIMIT_PUBKEY = Number(
  process.env.FREE_NETWORK_RATE_LIMIT_PUBKEY ?? "10",
);
const FREE_NETWORK_RATE_LIMIT_IP = Number(
  process.env.FREE_NETWORK_RATE_LIMIT_IP ?? "10",
);
const FREE_NETWORK_RATE_LIMIT_GLOBAL = Number(
  process.env.FREE_NETWORK_RATE_LIMIT_GLOBAL ?? "200",
);

function calcInvoiceSats(feeSats: number): number {
  return Math.ceil(feeSats * (1 + FEE_MARKUP_PERCENT / 100));
}

async function getFeeRateForPriority(
  priority: "high" | "medium",
): Promise<number> {
  const priorityOverride =
    priority === "high"
      ? FORCE_FEE_RATE_HIGH_SAT_PER_VBYTE
      : FORCE_FEE_RATE_MEDIUM_SAT_PER_VBYTE;
  if (priorityOverride !== null) return priorityOverride / 1e5;
  if (FORCE_FEE_RATE_SAT_PER_VBYTE !== null)
    return FORCE_FEE_RATE_SAT_PER_VBYTE / 1e5;
  const blocks = priority === "high" ? 1 : 3;
  const { feerate } = await estimateSmartFee(blocks);
  return feerate > 0 ? feerate : FALLBACK_FEE_RATE_BTC_PER_KB;
}

function calcEstimatedFeeSats(
  payloadHex: string,
  feeRateBtcPerKb: number,
): number {
  const payloadBytes = payloadHex.length / 2;
  const vSize = 121 + payloadBytes;
  const feeRateSatPerVByte = (feeRateBtcPerKb * 1e8) / 1000;
  return Math.ceil(vSize * feeRateSatPerVByte);
}

function calcEstimatedFeeSatsV1(
  chunkHexes: string[],
  feeRateBtcPerKb: number,
): number {
  const feeRateSatPerVByte = (feeRateBtcPerKb * 1e8) / 1000;
  let totalVSize = 0;
  for (const hex of chunkHexes) {
    totalVSize += 121 + hex.length / 2;
  }
  return Math.ceil(totalVSize * feeRateSatPerVByte);
}

async function preparePending(
  action: string,
  pubkey: string,
  payloadHex: string,
  estimatedFeeSats: number,
  feeRateBtcPerKb: number,
  requestBody: object,
  protocolVersion: number = 1,
  chunksJson?: string,
): Promise<{
  invoice: string;
  paymentHash: string;
  feeSats: number;
  invoiceSats: number;
}> {
  if (protocolVersion === 0 && process.env.ALLOW_BROADCAST_V0 !== "true") {
    throw new Error("Protocol version 0 broadcasting is not enabled");
  }

  const invoiceSats = calcInvoiceSats(estimatedFeeSats);
  const { preimage, paymentHash } = generatePreimage();
  const paymentHashHex = paymentHash.toString("hex");
  const preimageHex = preimage.toString("hex");

  const invoice = await createHoldInvoice(
    paymentHashHex,
    invoiceSats,
    `ORS ${action}`,
    INVOICE_EXPIRY_SECS,
  );
  const expiresAt = new Date(Date.now() + INVOICE_EXPIRY_SECS * 1000);

  await prisma.pendingBroadcast.create({
    data: {
      paymentHash: paymentHashHex,
      preimage: preimageHex,
      invoice,
      payloadHex,
      chunksJson: chunksJson ?? null,
      protocolVersion,
      estimatedFeeSats,
      feeRateBtcPerKb,
      invoiceSats,
      broadcast: false,
      expiresAt,
      action,
      requestJson: JSON.stringify(requestBody),
      network: "mainnet",
      pubkey,
    },
  });

  return {
    invoice,
    paymentHash: paymentHashHex,
    feeSats: estimatedFeeSats,
    invoiceSats,
  };
}

const MAX_CHUNKS_PER_REQUEST = 5;

function parseFeeBump(fbRaw: unknown): number {
  return (typeof fbRaw === "number" && fbRaw >= 0 ? fbRaw : 0) / 1e5;
}

async function handleAction(
  action: string,
  pubkey: string,
  protocolVersion: number,
  feeBumpBtcPerKb: number,
  priority: "high" | "medium",
  buildV0: () => string,
  buildV1: () => string[],
  requestBody: object,
  res: express.Response,
): Promise<void> {
  try {
    const feerate = await getFeeRateForPriority(priority);
    const effectiveFeeRate = feerate + feeBumpBtcPerKb;
    const effectiveSatPerVByte = (effectiveFeeRate * 1e8) / 1000;

    if (effectiveSatPerVByte > MAX_FEE_RATE_MAINNET_SAT_VBYTE) {
      res.status(400).json({
        error: `Fee rate ${effectiveSatPerVByte.toFixed(1)} sat/vByte exceeds maximum of ${MAX_FEE_RATE_MAINNET_SAT_VBYTE} sat/vByte`,
      });
      return;
    }

    let estimatedFeeSats: number;
    let payloadHex: string;
    let chunksJson: string | undefined;

    if (protocolVersion === 0) {
      payloadHex = buildV0();
      estimatedFeeSats = calcEstimatedFeeSats(payloadHex, effectiveFeeRate);
    } else {
      const chunks = buildV1();
      if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
        res.status(400).json({
          error: `Payload exceeds maximum chunk limit of ${MAX_CHUNKS_PER_REQUEST}`,
        });
        return;
      }
      chunksJson = JSON.stringify(chunks);
      payloadHex = "";
      estimatedFeeSats = calcEstimatedFeeSatsV1(chunks, effectiveFeeRate);
    }

    const walletBalanceBtc = await getWalletBalance();
    if (walletBalanceBtc < estimatedFeeSats / 1e8) {
      res.status(503).json({
        error:
          "Facilitator has insufficient wallet balance to cover transaction fee",
      });
      return;
    }

    const result = await preparePending(
      action,
      pubkey,
      payloadHex,
      estimatedFeeSats,
      effectiveFeeRate,
      requestBody,
      protocolVersion,
      chunksJson,
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[facilitator] ${action} error:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
}

// Checks mainnet-activity gate for free network requests.
// Returns true if allowed, false (and sends 403) if blocked.
async function checkMainnetGate(
  pubkey: string,
  res: express.Response,
): Promise<boolean> {
  // NOTE: disabled to lower entry barrier. May need adjusting in the future.
  /*const resp = await fetch(`${CACHE_SERVER_URL}/pubkey/${pubkey}/mainnet-active`);
  if (!resp.ok) {
    // Cache server unreachable - fail open (allow) to avoid blocking users during downtime
    console.warn(`[facilitator] mainnet-active check failed for ${pubkey.slice(0, 8)}…, allowing`);
    return true;
  }
  const { active } = (await resp.json()) as { active: boolean };
  if (!active) {
    res.status(403).json({ error: "Post on mainnet at least once to unlock free posting." });
    return false;
  }*/
  return true;
}

// In-memory sliding-window stores for IP and global rate limits
const ipRequestLog = new Map<string, number[]>();
let globalRequestLog: number[] = [];

function checkInMemoryRateLimit(
  log: number[],
  limit: number,
  windowMs: number,
): { allowed: boolean; updatedLog: number[] } {
  const now = Date.now();
  const trimmed = log.filter((t) => now - t < windowMs);
  if (trimmed.length >= limit) {
    return { allowed: false, updatedLog: trimmed };
  }
  return { allowed: true, updatedLog: [...trimmed, now] };
}

// Rate limit check: global -> IP -> pubkey, all using a 10-minute rolling window.
async function checkFreeNetworkRateLimit(
  pubkey: string,
  ip: string,
  res: express.Response,
): Promise<boolean> {
  const windowMs = 10 * 60 * 1000;

  // Global rate limit (in-memory)
  const globalCheck = checkInMemoryRateLimit(
    globalRequestLog,
    FREE_NETWORK_RATE_LIMIT_GLOBAL,
    windowMs,
  );
  if (!globalCheck.allowed) {
    console.error(
      `Free global network rate limit exceeded (${FREE_NETWORK_RATE_LIMIT_GLOBAL} actions per 10 minutes per IP). Try again later.`,
    );
    res.status(429).json({
      error: `Free network rate limit exceeded. Try again later.`,
    });
    return false;
  }

  // IP rate limit (in-memory)
  const ipLog = ipRequestLog.get(ip) ?? [];
  const ipCheck = checkInMemoryRateLimit(
    ipLog,
    FREE_NETWORK_RATE_LIMIT_IP,
    windowMs,
  );
  if (!ipCheck.allowed) {
    console.error(
      `Free IP network rate limit exceeded (${FREE_NETWORK_RATE_LIMIT_IP} actions per 10 minutes per IP ${ip}). Try again later.`,
    );
    res.status(429).json({
      error: `Free network rate limit exceeded. Try again later.`,
    });
    return false;
  }

  // Pubkey rate limit (DB-backed)
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.pendingBroadcast.count({
    where: { pubkey, network: FREE_NETWORK, createdAt: { gte: since } },
  });
  if (count >= FREE_NETWORK_RATE_LIMIT_PUBKEY) {
    console.error(
      `Free pubkey network rate limit exceeded (${FREE_NETWORK_RATE_LIMIT_PUBKEY} actions per 10 minutes per pubkey ${pubkey}). Try again later.`,
    );
    res.status(429).json({
      error: `Free network global rate limit exceeded. Try again later.`,
    });
    return false;
  }

  // All checks passed - commit in-memory counters
  globalRequestLog = globalCheck.updatedLog;
  ipRequestLog.set(ip, ipCheck.updatedLog);
  return true;
}

// Broadcasts a free network TX directly (no Lightning payment required).
async function broadcastFreeNetwork(
  action: string,
  pubkey: string,
  payloadHex: string,
  chunksJson: string | undefined,
  feeRateBtcPerKb: number,
  requestBody: object,
): Promise<{ txid: string }> {
  const rpc = getRpc(FREE_NETWORK);

  const broadcast = async () => {
    if (!chunksJson) {
      // v0: single TX
      const raw = await rpc.createRawTransaction([], [{ data: payloadHex }]);
      const { hex: funded } = await rpc.fundRawTransactionWithRate(
        raw,
        feeRateBtcPerKb,
      );
      const { hex: signed, complete } =
        await rpc.signRawTransactionWithWallet(funded);
      if (!complete) throw new Error("Wallet signing incomplete");
      try {
        return await rpc.sendRawTransaction(signed);
      } catch (err) {
        try {
          const decoded = await rpc.decodeRawTransaction(signed);
          const inputs = decoded.vin.filter((v) => v.txid);
          if (inputs.length > 0) await rpc.unlockInputs(inputs);
        } catch {
          /* ignore unlock errors */
        }
        throw err;
      }
    } else {
      // v1: broadcast each chunk
      const chunks: string[] = JSON.parse(chunksJson);
      const txids: string[] = [];
      for (const chunk of chunks) {
        const raw = await rpc.createRawTransaction([], [{ data: chunk }]);
        const { hex: funded } = await rpc.fundRawTransactionWithRate(
          raw,
          feeRateBtcPerKb,
        );
        const { hex: signed, complete } =
          await rpc.signRawTransactionWithWallet(funded);
        if (!complete) throw new Error("Wallet signing incomplete");
        try {
          txids.push(await rpc.sendRawTransaction(signed));
        } catch (err) {
          try {
            const decoded = await rpc.decodeRawTransaction(signed);
            const inputs = decoded.vin.filter((v) => v.txid);
            if (inputs.length > 0) await rpc.unlockInputs(inputs);
          } catch {
            /* ignore */
          }
          throw err;
        }
      }
      return txids[0];
    }
  };

  const txid = await serialisedFreeNetworkBroadcast(broadcast);

  // Record in PendingBroadcast (already broadcast)
  await prisma.pendingBroadcast.create({
    data: {
      paymentHash: `${FREE_NETWORK}-${txid}`,
      preimage: "",
      invoice: "",
      payloadHex: payloadHex,
      chunksJson: chunksJson ?? null,
      protocolVersion: chunksJson ? 1 : 0,
      estimatedFeeSats: 0,
      feeRateBtcPerKb,
      invoiceSats: 0,
      broadcast: true,
      txid,
      expiresAt: new Date(),
      action,
      requestJson: JSON.stringify(requestBody),
      network: FREE_NETWORK,
      pubkey,
    },
  });

  // Notify cache server
  notifyCache(action, JSON.stringify(requestBody), txid, FREE_NETWORK).catch(
    (e) =>
      console.error(`[facilitator] notify cache (${FREE_NETWORK}) error:`, e),
  );

  console.log(`[facilitator] ${FREE_NETWORK} broadcast txid: ${txid}`);
  return { txid };
}

async function handleFreeNetworkAction(
  action: string,
  pubkey: string,
  ip: string,
  feeBumpSatPerVByte: number,
  buildV1: () => string[],
  requestBody: object,
  res: express.Response,
  buildV0: () => string,
  protocolVersion = 1,
): Promise<void> {
  try {
    // Rate limit
    if (!(await checkFreeNetworkRateLimit(pubkey, ip, res))) return;

    // Fee rate cap for free network
    const feeRateSatPerVByte = Math.min(
      feeBumpSatPerVByte > 0 ? feeBumpSatPerVByte : 1,
      MAX_FEE_RATE_FREE_NETWORK_SAT_VBYTE,
    );
    const feeRateBtcPerKb = feeRateSatPerVByte / 1e5;

    let payloadHex = "";
    let chunksJson: string | undefined;

    if (protocolVersion === 0 && buildV0) {
      payloadHex = buildV0();
    } else {
      const chunks = buildV1();
      if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
        res.status(400).json({
          error: `Payload exceeds maximum chunk limit of ${MAX_CHUNKS_PER_REQUEST}`,
        });
        return;
      }
      chunksJson = chunks.length > 0 ? JSON.stringify(chunks) : undefined;
    }

    const { txid } = await broadcastFreeNetwork(
      action,
      pubkey,
      payloadHex,
      chunksJson,
      feeRateBtcPerKb,
      requestBody,
    );
    res.json({ ok: true, txid });
  } catch (err) {
    console.error(`[facilitator] ${FREE_NETWORK} ${action} error:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
}

// Serialised broadcast queues - separate per network to avoid UTXO conflicts
let broadcastQueue = Promise.resolve<unknown>(undefined);
function serialisedBroadcast<T>(fn: () => Promise<T>): Promise<T> {
  const result = broadcastQueue.then(() => fn());
  broadcastQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

let freeNetworkBroadcastQueue = Promise.resolve<unknown>(undefined);
function serialisedFreeNetworkBroadcast<T>(fn: () => Promise<T>): Promise<T> {
  const result = freeNetworkBroadcastQueue.then(() => fn());
  freeNetworkBroadcastQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

export function createServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/wallet-balance", async (_req, res) => {
    try {
      const [mainnet, freeNetwork] = await Promise.all([
        getRpc("mainnet").getWalletBalance(),
        getRpc("free").getWalletBalance(),
      ]);
      res.json({
        mainnetSatoshis: Math.round(mainnet * 1e8),
        freeNetworkSatoshis: Math.round(freeNetwork * 1e8),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/fee-rate", async (_req, res) => {
    try {
      const [highRate, mediumRate] = await Promise.all([
        getFeeRateForPriority("high"),
        getFeeRateForPriority("medium"),
      ]);
      res.json({
        high: { satPerVByte: (highRate * 1e8) / 1000 },
        medium: { satPerVByte: (mediumRate * 1e8) / 1000 },
        feeMarkupPercent: FEE_MARKUP_PERCENT,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // --- Mainnet endpoints (Lightning payment required) ---

  app.post("/post", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!content || !pubkey || !sig) {
      res.status(400).json({ error: "content, pubkey, and sig are required" });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "post",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayload(content, pubkey, sig),
      () => buildPayloadV1(content, pubkey, sig),
      { content, pubkey, sig, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/reply", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      parentTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      parentTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!content || !pubkey || !sig || !parentTxid) {
      res
        .status(400)
        .json({ error: "content, pubkey, sig, and parentTxid are required" });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "reply",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayloadReply(content, pubkey, sig, parentTxid),
      () => buildPayloadReplyV1(content, pubkey, sig, parentTxid),
      { content, pubkey, sig, parentTxid, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/repost", async (req, res) => {
    const {
      pubkey,
      sig,
      referencedTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      pubkey?: string;
      sig?: string;
      referencedTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!pubkey || !sig || !referencedTxid) {
      res
        .status(400)
        .json({ error: "pubkey, sig, and referencedTxid are required" });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "repost",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayloadRepost(pubkey, sig, referencedTxid),
      () => buildPayloadRepostV1(pubkey, sig, referencedTxid),
      { pubkey, sig, referencedTxid, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/quote-repost", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      referencedTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      referencedTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!content || !pubkey || !sig || !referencedTxid) {
      res.status(400).json({
        error: "content, pubkey, sig, and referencedTxid are required",
      });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "quote-repost",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayloadQuoteRepost(content, pubkey, sig, referencedTxid),
      () => buildPayloadQuoteRepostV1(content, pubkey, sig, referencedTxid),
      { content, pubkey, sig, referencedTxid, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/follow", async (req, res) => {
    const {
      targetPubkey,
      isFollow,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      targetPubkey?: string;
      isFollow?: boolean;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!targetPubkey || typeof isFollow !== "boolean" || !pubkey || !sig) {
      res.status(400).json({
        error: "targetPubkey, isFollow, pubkey, and sig are required",
      });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "follow",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayloadFollow(targetPubkey, isFollow, pubkey, sig),
      () => buildPayloadFollowV1(targetPubkey, isFollow, pubkey, sig),
      { targetPubkey, isFollow, pubkey, sig, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/profile", async (req, res) => {
    const {
      propertyKind,
      value,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      propertyKind?: number;
      value?: string;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (typeof propertyKind !== "number" || !value || !pubkey || !sig) {
      res
        .status(400)
        .json({ error: "propertyKind, value, pubkey, and sig are required" });
      return;
    }
    const pv2 = pv ?? 1;
    await handleAction(
      "profile",
      pubkey,
      pv2,
      parseFeeBump(fbRaw),
      feePriority === "high" ? "high" : "medium",
      () => buildPayloadProfile(propertyKind, value, pubkey, sig),
      () => buildPayloadProfileV1(propertyKind, value, pubkey, sig),
      { propertyKind, value, pubkey, sig, protocolVersion: pv2 },
      res,
    );
  });

  app.post("/sponsor", async (req, res) => {
    const {
      testnetTxid,
      feeBumpSatPerVByte: fbRaw,
      feePriority,
    } = req.body as {
      testnetTxid?: string;
      feeBumpSatPerVByte?: number;
      feePriority?: string;
    };
    if (!testnetTxid) {
      res.status(400).json({ error: "testnetTxid is required" });
      return;
    }
    try {
      // Fetch tx data from cache server - no bitcoin RPC needed
      let chunks: string[];
      let pubkey: string;
      let resolvedData: Record<string, unknown>;

      const postRes = await fetch(`${CACHE_SERVER_URL}/posts/${testnetTxid}`);
      if (postRes.ok) {
        const post = (await postRes.json()) as {
          txid: string;
          content: string;
          pubkey: string;
          sig: string;
          kind: number;
          parentTxid?: string | null;
        };
        pubkey = post.pubkey;
        resolvedData = {
          kind: post.kind,
          content: post.content,
          pubkey: post.pubkey,
          sig: post.sig,
          parentTxid: post.parentTxid,
        };
        if (post.kind === 0x01) {
          chunks = buildPayloadV1(post.content, post.pubkey, post.sig);
        } else if (post.kind === 0x03) {
          if (!post.parentTxid) {
            res.status(400).json({ error: "Reply is missing parentTxid" });
            return;
          }
          chunks = buildPayloadReplyV1(
            post.content,
            post.pubkey,
            post.sig,
            post.parentTxid,
          );
        } else if (post.kind === 0x04) {
          if (!post.parentTxid) {
            res.status(400).json({ error: "Repost is missing parentTxid" });
            return;
          }
          chunks = buildPayloadRepostV1(post.pubkey, post.sig, post.parentTxid);
        } else if (post.kind === 0x05) {
          if (!post.parentTxid) {
            res
              .status(400)
              .json({ error: "Quote repost is missing parentTxid" });
            return;
          }
          chunks = buildPayloadQuoteRepostV1(
            post.content,
            post.pubkey,
            post.sig,
            post.parentTxid,
          );
        } else {
          res
            .status(400)
            .json({ error: `Unsupported post kind: ${post.kind}` });
          return;
        }
      } else {
        const actRes = await fetch(
          `${CACHE_SERVER_URL}/activity/${testnetTxid}`,
        );
        if (!actRes.ok) {
          res
            .status(404)
            .json({ error: "Transaction not found in cache server" });
          return;
        }
        const item = (await actRes.json()) as {
          type: string;
          pubkey: string;
          sig?: string;
          targetPubkey?: string;
          isFollow?: boolean;
          propertyKind?: number;
          value?: string;
        };
        if (!item.sig) {
          res
            .status(400)
            .json({ error: "Transaction signature not available" });
          return;
        }
        pubkey = item.pubkey;
        resolvedData = {
          activityType: item.type,
          pubkey: item.pubkey,
          sig: item.sig,
          targetPubkey: item.targetPubkey,
          isFollow: item.type === "follow",
          propertyKind: item.propertyKind,
          value: item.value,
        };
        if (item.type === "follow" || item.type === "unfollow") {
          if (!item.targetPubkey) {
            res.status(400).json({ error: "Follow is missing targetPubkey" });
            return;
          }
          chunks = buildPayloadFollowV1(
            item.targetPubkey,
            item.type === "follow",
            item.pubkey,
            item.sig,
          );
        } else if (item.type === "profile_update") {
          if (item.propertyKind === undefined || item.value === undefined) {
            res.status(400).json({
              error: "Profile update is missing propertyKind or value",
            });
            return;
          }
          chunks = buildPayloadProfileV1(
            item.propertyKind,
            item.value,
            item.pubkey,
            item.sig,
          );
        } else {
          res
            .status(400)
            .json({ error: `Unsupported activity type: ${item.type}` });
          return;
        }
      }

      const priority = feePriority === "high" ? "high" : "medium";
      const feerate = await getFeeRateForPriority(priority);
      const feeBump = parseFeeBump(fbRaw);
      const effectiveFeeRate = feerate + feeBump;
      const effectiveSatPerVByte = (effectiveFeeRate * 1e8) / 1000;
      if (effectiveSatPerVByte > MAX_FEE_RATE_MAINNET_SAT_VBYTE) {
        res.status(400).json({
          error: `Fee rate ${effectiveSatPerVByte.toFixed(1)} sat/vByte exceeds maximum of ${MAX_FEE_RATE_MAINNET_SAT_VBYTE} sat/vByte`,
        });
        return;
      }
      const estimatedFeeSats = calcEstimatedFeeSatsV1(chunks, effectiveFeeRate);
      const walletBalanceBtc = await getWalletBalance();
      if (walletBalanceBtc < estimatedFeeSats / 1e8) {
        res.status(503).json({
          error:
            "Facilitator has insufficient wallet balance to cover transaction fee",
        });
        return;
      }
      const result = await preparePending(
        "sponsor",
        pubkey,
        "",
        estimatedFeeSats,
        effectiveFeeRate,
        { ...req.body, ...resolvedData },
        1,
        JSON.stringify(chunks),
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[facilitator] sponsor error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/status/:paymentHash", async (req, res) => {
    const { paymentHash } = req.params;
    const pending = await prisma.pendingBroadcast.findUnique({
      where: { paymentHash },
    });
    if (!pending) {
      res
        .status(404)
        .json({ error: "No pending broadcast found for this payment hash" });
      return;
    }
    res.json({ broadcast: pending.broadcast, txid: pending.txid ?? null });
  });

  // --- Free network endpoints (no Lightning required) ---

  app.post("/free/post", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (!content || !pubkey || !sig) {
      res.status(400).json({ error: "content, pubkey, and sig are required" });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "post",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadV1(content, pubkey, sig),
      { content, pubkey, sig, protocolVersion: pv ?? 1 },
      res,
      () => buildPayload(content, pubkey, sig),
      pv ?? 1,
    );
  });

  app.post("/free/reply", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      parentTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      parentTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (!content || !pubkey || !sig || !parentTxid) {
      res
        .status(400)
        .json({ error: "content, pubkey, sig, and parentTxid are required" });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "reply",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadReplyV1(content, pubkey, sig, parentTxid),
      { content, pubkey, sig, parentTxid, protocolVersion: pv ?? 1 },
      res,
      () => buildPayloadReply(content, pubkey, sig, parentTxid),
      pv ?? 1,
    );
  });

  app.post("/free/repost", async (req, res) => {
    const {
      pubkey,
      sig,
      referencedTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      pubkey?: string;
      sig?: string;
      referencedTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (!pubkey || !sig || !referencedTxid) {
      res
        .status(400)
        .json({ error: "pubkey, sig, and referencedTxid are required" });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "repost",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadRepostV1(pubkey, sig, referencedTxid),
      { pubkey, sig, referencedTxid, protocolVersion: pv ?? 1 },
      res,
      () => buildPayloadRepost(pubkey, sig, referencedTxid),
      pv ?? 1,
    );
  });

  app.post("/free/quote-repost", async (req, res) => {
    const {
      content,
      pubkey,
      sig,
      referencedTxid,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      content?: string;
      pubkey?: string;
      sig?: string;
      referencedTxid?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (!content || !pubkey || !sig || !referencedTxid) {
      res.status(400).json({
        error: "content, pubkey, sig, and referencedTxid are required",
      });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "quote-repost",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadQuoteRepostV1(content, pubkey, sig, referencedTxid),
      { content, pubkey, sig, referencedTxid, protocolVersion: pv ?? 1 },
      res,
      () => buildPayloadQuoteRepost(content, pubkey, sig, referencedTxid),
      pv ?? 1,
    );
  });

  app.post("/free/follow", async (req, res) => {
    const {
      targetPubkey,
      isFollow,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      targetPubkey?: string;
      isFollow?: boolean;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (!targetPubkey || typeof isFollow !== "boolean" || !pubkey || !sig) {
      res.status(400).json({
        error: "targetPubkey, isFollow, pubkey, and sig are required",
      });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "follow",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadFollowV1(targetPubkey, isFollow, pubkey, sig),
      { targetPubkey, isFollow, pubkey, sig, protocolVersion: pv ?? 1 },
      res,
      () => buildPayloadFollow(targetPubkey, isFollow, pubkey, sig),
      pv ?? 1,
    );
  });

  app.post("/free/profile", async (req, res) => {
    const {
      propertyKind,
      value,
      pubkey,
      sig,
      protocolVersion: pv,
      feeBumpSatPerVByte: fbRaw,
    } = req.body as {
      propertyKind?: number;
      value?: string;
      pubkey?: string;
      sig?: string;
      protocolVersion?: number;
      feeBumpSatPerVByte?: number;
    };
    if (typeof propertyKind !== "number" || !value || !pubkey || !sig) {
      res
        .status(400)
        .json({ error: "propertyKind, value, pubkey, and sig are required" });
      return;
    }
    if (!(await checkMainnetGate(pubkey, res))) return;
    await handleFreeNetworkAction(
      "profile",
      pubkey,
      req.ip ?? "",
      typeof fbRaw === "number" ? fbRaw : 0,
      () => buildPayloadProfileV1(propertyKind, value, pubkey, sig),
      { propertyKind, value, pubkey, sig, protocolVersion: pv ?? 1 },
      res,
      () => buildPayloadProfile(propertyKind, value, pubkey, sig),
      pv ?? 1,
    );
  });

  return app;
}

async function doBroadcast(paymentHash: string): Promise<void> {
  const pending = await prisma.pendingBroadcast.findUnique({
    where: { paymentHash },
  });
  if (!pending) {
    console.error(
      "[facilitator] doBroadcast: no pending record for",
      paymentHash,
    );
    return;
  }
  if (pending.broadcast) return;
  if (new Date() > pending.expiresAt) {
    console.error(
      "[facilitator] doBroadcast: invoice expired for",
      paymentHash,
    );
    return;
  }

  let broadcastTxid: string;
  let allChunkTxids: string[] | undefined;
  try {
    const result = await serialisedBroadcast(async () => {
      if (pending.protocolVersion === 0) {
        const raw = await createRawTransaction(
          [],
          [{ data: pending.payloadHex }],
        );
        const { hex: funded } = await fundRawTransactionWithRate(
          raw,
          pending.feeRateBtcPerKb,
        );
        const { hex: signed, complete } =
          await signRawTransactionWithWallet(funded);
        if (!complete)
          throw new Error(
            "Wallet signing incomplete - is the wallet unlocked?",
          );
        try {
          const txid = await sendRawTransaction(signed);
          return { txid, chunkTxids: undefined };
        } catch (broadcastErr) {
          try {
            const decoded = await decodeRawTransaction(signed);
            const inputs = decoded.vin.filter((v) => v.txid);
            if (inputs.length > 0) await unlockInputs(inputs);
          } catch (unlockErr) {
            console.error("[facilitator] unlockInputs error:", unlockErr);
          }
          throw broadcastErr;
        }
      } else {
        const chunks: string[] = JSON.parse(pending.chunksJson!);
        const txids: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const raw = await createRawTransaction([], [{ data: chunks[i] }]);
          const { hex: funded } = await fundRawTransactionWithRate(
            raw,
            pending.feeRateBtcPerKb,
          );
          const { hex: signed, complete } =
            await signRawTransactionWithWallet(funded);
          if (!complete)
            throw new Error(
              "Wallet signing incomplete - is the wallet unlocked?",
            );
          try {
            const txid = await sendRawTransaction(signed);
            txids.push(txid);
          } catch (broadcastErr) {
            try {
              const decoded = await decodeRawTransaction(signed);
              const inputs = decoded.vin.filter((v) => v.txid);
              if (inputs.length > 0) await unlockInputs(inputs);
            } catch (unlockErr) {
              console.error("[facilitator] unlockInputs error:", unlockErr);
            }
            throw broadcastErr;
          }
        }
        return { txid: txids[0], chunkTxids: txids };
      }
    });
    broadcastTxid = result.txid;
    allChunkTxids = result.chunkTxids;
  } catch (err) {
    console.error("[facilitator] broadcast error:", err);
    cancelHoldInvoice(paymentHash).catch((e) =>
      console.error("[facilitator] cancelHoldInvoice error:", e),
    );
    return;
  }

  await prisma.pendingBroadcast.update({
    where: { paymentHash },
    data: {
      broadcast: true,
      txid: broadcastTxid,
      chunkTxids: allChunkTxids ? JSON.stringify(allChunkTxids) : null,
    },
  });

  settleHoldInvoice(pending.preimage).catch((e) =>
    console.error("[facilitator] settleHoldInvoice error:", e),
  );
  notifyCache(
    pending.action,
    pending.requestJson,
    broadcastTxid,
    "mainnet",
  ).catch((e) => console.error("[facilitator] notify cache error:", e));
  console.log("[facilitator] auto-broadcast txid:", broadcastTxid);
}

export async function initNotifications(): Promise<void> {
  await subscribeHoldInvoiceAccepted(async (paymentHash) => {
    try {
      await doBroadcast(paymentHash);
    } catch (err) {
      console.error("[facilitator] auto-broadcast error:", err);
    }
  });
  console.log(
    "[facilitator] subscribed to hold_invoice_accepted notifications",
  );
}

async function notifyCache(
  action: string,
  requestJson: string,
  txid: string,
  network: string,
): Promise<void> {
  const req = JSON.parse(requestJson) as Record<string, unknown>;
  const timestamp = Math.floor(Date.now() / 1000);

  let body: Record<string, unknown>;
  switch (action) {
    case "post":
      body = {
        txid,
        block_height: 0,
        timestamp,
        content: req.content,
        kind: 1,
        pubkey: req.pubkey,
        sig: req.sig,
        network,
      };
      break;
    case "reply":
      body = {
        txid,
        block_height: 0,
        timestamp,
        content: req.content,
        kind: 3,
        pubkey: req.pubkey,
        sig: req.sig,
        parentTxid: req.parentTxid,
        network,
      };
      break;
    case "repost":
      body = {
        txid,
        block_height: 0,
        timestamp,
        content: "",
        kind: 4,
        pubkey: req.pubkey,
        sig: req.sig,
        parentTxid: req.referencedTxid,
        network,
      };
      break;
    case "quote-repost":
      body = {
        txid,
        block_height: 0,
        timestamp,
        content: req.content,
        kind: 5,
        pubkey: req.pubkey,
        sig: req.sig,
        parentTxid: req.referencedTxid,
        network,
      };
      break;
    case "follow":
      body = {
        txid,
        kind: 6,
        pubkey: req.pubkey,
        sig: req.sig,
        targetPubkey: req.targetPubkey,
        isFollow: req.isFollow,
        timestamp,
        block_height: 0,
        network,
      };
      break;
    case "profile":
      body = {
        txid,
        kind: 2,
        pubkey: req.pubkey,
        sig: req.sig,
        propertyKind: req.propertyKind,
        value: req.value,
        network,
      };
      break;
    case "sponsor": {
      const timestamp = Math.floor(Date.now() / 1000);
      if (req.kind !== undefined) {
        body = {
          txid,
          block_height: 0,
          timestamp,
          content: req.content ?? "",
          kind: req.kind,
          pubkey: req.pubkey,
          sig: req.sig,
          parentTxid: req.parentTxid ?? null,
          network,
        };
      } else if (
        req.activityType === "follow" ||
        req.activityType === "unfollow"
      ) {
        body = {
          txid,
          kind: 6,
          pubkey: req.pubkey,
          sig: req.sig,
          targetPubkey: req.targetPubkey,
          isFollow: req.isFollow,
          timestamp,
          block_height: 0,
          network,
        };
      } else if (req.activityType === "profile_update") {
        body = {
          txid,
          kind: 2,
          pubkey: req.pubkey,
          sig: req.sig,
          propertyKind: req.propertyKind,
          value: req.value,
          network,
        };
      } else {
        console.error(
          "[facilitator] sponsor notifyCache: unrecognized resolved data",
          req,
        );
        return;
      }
      break;
    }
    default:
      console.error("[facilitator] unknown action for cache notify:", action);
      return;
  }

  const resp = await fetch(`${CACHE_SERVER_URL}/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": CACHE_INTERNAL_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(
      `[facilitator] notifyCache ${action} failed ${resp.status}: ${text}`,
    );
  } else {
    console.log(
      `[facilitator] notifyCache ${action} ok, txid=${txid}, network=${network}`,
    );
  }
}
