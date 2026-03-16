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
} from "./rpc.js";
import { prisma } from "./db.js";

const CACHE_SERVER_URL =
  process.env.CACHE_SERVER_URL ?? "http://localhost:3001";
const CACHE_INTERNAL_TOKEN = process.env.CACHE_INTERNAL_TOKEN ?? "";
const FEE_MARKUP_PERCENT = Number(process.env.FEE_MARKUP_PERCENT ?? "10");
const INVOICE_EXPIRY_SECS = Number(process.env.INVOICE_EXPIRY_SECS ?? "600");
// Fallback fee rate (1 sat/vByte = 0.00001 BTC/kB) used when estimatesmartfee
// returns -1 (insufficient data, common on regtest).
const FALLBACK_FEE_RATE_BTC_PER_KB = Number(
  process.env.FALLBACK_FEE_RATE_BTC_PER_KB ?? "0.00001",
);
const FORCE_FEE_RATE_SAT_PER_VBYTE = process.env.FORCE_FEE_RATE_SAT_PER_VBYTE
  ? Number(process.env.FORCE_FEE_RATE_SAT_PER_VBYTE)
  : null;

function calcInvoiceSats(feeSats: number): number {
  return Math.ceil(feeSats * (1 + FEE_MARKUP_PERCENT / 100));
}

async function getFeeRate(): Promise<number> {
  if (FORCE_FEE_RATE_SAT_PER_VBYTE !== null) {
    return FORCE_FEE_RATE_SAT_PER_VBYTE / 1e5; // sat/vByte → BTC/kB
  }
  const { feerate } = await estimateSmartFee(1);
  return feerate > 0 ? feerate : FALLBACK_FEE_RATE_BTC_PER_KB;
}

function calcEstimatedFeeSats(
  payloadHex: string,
  feeRateBtcPerKb: number,
): number {
  const payloadBytes = payloadHex.length / 2;
  // vSize: 10 header + 68 P2WPKH input + (12 + payload) OP_RETURN + 31 change
  const vSize = 121 + payloadBytes;
  // feeRateBtcPerKb is BTC/kB; convert to sat/vByte: * 1e8 / 1000
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
    const payloadBytes = hex.length / 2;
    totalVSize += 121 + payloadBytes;
  }
  return Math.ceil(totalVSize * feeRateSatPerVByte);
}

async function preparePending(
  action: string,
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
  protocolVersion: number,
  feeBumpBtcPerKb: number,
  buildV0: () => string,
  buildV1: () => string[],
  requestBody: object,
  res: express.Response,
): Promise<void> {
  try {
    const feerate = await getFeeRate();
    const effectiveFeeRate = feerate + feeBumpBtcPerKb;
    let estimatedFeeSats: number;
    let payloadHex: string;
    let chunksJson: string | undefined;

    if (protocolVersion === 0) {
      payloadHex = buildV0();
      estimatedFeeSats = calcEstimatedFeeSats(payloadHex, effectiveFeeRate);
    } else {
      const chunks = buildV1();
      if (chunks.length > MAX_CHUNKS_PER_REQUEST) {
        res.status(400).json({ error: `Payload exceeds maximum chunk limit of ${MAX_CHUNKS_PER_REQUEST}` });
        return;
      }
      chunksJson = JSON.stringify(chunks);
      payloadHex = "";
      estimatedFeeSats = calcEstimatedFeeSatsV1(chunks, effectiveFeeRate);
    }

    const result = await preparePending(
      action,
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

// Serialised promise queue for the build+broadcast critical section.
// Ensures simultaneous confirms process one at a time so the second
// can spend the change output produced by the first.
let broadcastQueue = Promise.resolve<unknown>(undefined);
function serialisedBroadcast<T>(fn: () => Promise<T>): Promise<T> {
  const result = broadcastQueue.then(() => fn());
  broadcastQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/fee-rate", async (_req, res) => {
    try {
      const feeRateBtcPerKb = await getFeeRate();
      const satPerVByte = (feeRateBtcPerKb * 1e8) / 1000;
      res.json({ satPerVByte });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/post", async (req, res) => {
    const { content, pubkey, sig, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      content?: string; pubkey?: string; sig?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (!content || !pubkey || !sig) {
      res.status(400).json({ error: "content, pubkey, and sig are required" });
      return;
    }

    await handleAction(
      "post", protocolVersion, feeBumpBtcPerKb,
      () => buildPayload(content, pubkey, sig),
      () => buildPayloadV1(content, pubkey, sig),
      { content, pubkey, sig, protocolVersion },
      res,
    );
  });

  app.post("/reply", async (req, res) => {
    const { content, pubkey, sig, parentTxid, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      content?: string; pubkey?: string; sig?: string; parentTxid?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (!content || !pubkey || !sig || !parentTxid) {
      res.status(400).json({ error: "content, pubkey, sig, and parentTxid are required" });
      return;
    }

    await handleAction(
      "reply", protocolVersion, feeBumpBtcPerKb,
      () => buildPayloadReply(content, pubkey, sig, parentTxid),
      () => buildPayloadReplyV1(content, pubkey, sig, parentTxid),
      { content, pubkey, sig, parentTxid, protocolVersion },
      res,
    );
  });

  app.post("/repost", async (req, res) => {
    const { pubkey, sig, referencedTxid, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      pubkey?: string; sig?: string; referencedTxid?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (!pubkey || !sig || !referencedTxid) {
      res.status(400).json({ error: "pubkey, sig, and referencedTxid are required" });
      return;
    }

    await handleAction(
      "repost", protocolVersion, feeBumpBtcPerKb,
      () => buildPayloadRepost(pubkey, sig, referencedTxid),
      () => buildPayloadRepostV1(pubkey, sig, referencedTxid),
      { pubkey, sig, referencedTxid, protocolVersion },
      res,
    );
  });

  app.post("/quote-repost", async (req, res) => {
    const { content, pubkey, sig, referencedTxid, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      content?: string; pubkey?: string; sig?: string; referencedTxid?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (!content || !pubkey || !sig || !referencedTxid) {
      res.status(400).json({ error: "content, pubkey, sig, and referencedTxid are required" });
      return;
    }

    await handleAction(
      "quote-repost", protocolVersion, feeBumpBtcPerKb,
      () => buildPayloadQuoteRepost(content, pubkey, sig, referencedTxid),
      () => buildPayloadQuoteRepostV1(content, pubkey, sig, referencedTxid),
      { content, pubkey, sig, referencedTxid, protocolVersion },
      res,
    );
  });

  app.post("/follow", async (req, res) => {
    const { targetPubkey, isFollow, pubkey, sig, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      targetPubkey?: string; isFollow?: boolean; pubkey?: string; sig?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (!targetPubkey || typeof isFollow !== "boolean" || !pubkey || !sig) {
      res.status(400).json({ error: "targetPubkey, isFollow, pubkey, and sig are required" });
      return;
    }

    await handleAction(
      "follow", protocolVersion, feeBumpBtcPerKb,
      () => buildPayloadFollow(targetPubkey, isFollow, pubkey, sig),
      () => buildPayloadFollowV1(targetPubkey, isFollow, pubkey, sig),
      { targetPubkey, isFollow, pubkey, sig, protocolVersion },
      res,
    );
  });

  app.post("/profile", async (req, res) => {
    const { propertyKind, value, pubkey, sig, protocolVersion: pv, feeBumpSatPerVByte: fbRaw } = req.body as {
      propertyKind?: number; value?: string; pubkey?: string; sig?: string;
      protocolVersion?: number; feeBumpSatPerVByte?: number;
    };
    const protocolVersion = pv ?? 1;
    const feeBumpBtcPerKb = parseFeeBump(fbRaw);

    if (typeof propertyKind !== "number" || !value || !pubkey || !sig) {
      res.status(400).json({ error: "propertyKind, value, pubkey, and sig are required" });
      return;
    }

    await handleAction(
      "profile", protocolVersion, feeBumpBtcPerKb,
      () => buildPayloadProfile(propertyKind, value, pubkey, sig),
      () => buildPayloadProfileV1(propertyKind, value, pubkey, sig),
      { propertyKind, value, pubkey, sig, protocolVersion },
      res,
    );
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

  // Idempotency: already broadcast
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
        // v0: single transaction
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
        // v1: broadcast each chunk sequentially
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
            // Unlock inputs for this chunk (already-sent chunks cannot be undone)
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
        // Chunk 0 txid is the canonical post id
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

  notifyCache(pending.action, pending.requestJson, broadcastTxid).catch((e) =>
    console.error("[facilitator] notify cache error:", e),
  );

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
      };
      break;
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
    console.log(`[facilitator] notifyCache ${action} ok, txid=${txid}`);
  }
}
