import crypto from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import * as tinysecp from "tiny-secp256k1";
import {
  buildUnsignedPayload,
  buildProfileUpdateUnsignedPayload,
  buildReplyUnsignedPayload,
  buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload,
  buildFollowUnsignedPayload,
  KIND_PROFILE_UPDATE,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_FOLLOW,
} from "@ors/protocol";
import { prisma } from "./db.js";
import { rescanFrom } from "./scanner.js";
import type { StoredPost, StoredProfile } from "./types.js";

const INTERNAL_TOKEN = process.env.CACHE_INTERNAL_TOKEN ?? "";

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  if (!INTERNAL_TOKEN || req.headers["x-internal-token"] !== INTERNAL_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/posts", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const pubkey = req.query.pubkey as string | undefined;

    const posts = await prisma.post.findMany({
      take: limit,
      skip: offset,
      where: pubkey ? { pubkey, status: { not: "evicted" } } : { status: { not: "evicted" } },
      orderBy: [{ timestamp: "desc" }, { txid: "asc" }],
    });

    const result: StoredPost[] = posts.map((p) => ({
      txid: p.txid,
      blockHeight: p.blockHeight,
      timestamp: p.timestamp,
      content: p.content,
      kind: p.kind,
      pubkey: p.pubkey,
      sig: p.sig,
      parentTxid: p.parentTxid,
      status: p.status,
    }));

    res.json({ posts: result });
  });

  app.get("/posts/:txid", async (req, res) => {
    const post = await prisma.post.findUnique({ where: { txid: req.params.txid } });
    if (!post) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result: StoredPost = {
      txid: post.txid,
      blockHeight: post.blockHeight,
      timestamp: post.timestamp,
      content: post.content,
      kind: post.kind,
      pubkey: post.pubkey,
      sig: post.sig,
      parentTxid: post.parentTxid,
      status: post.status,
    };
    res.json(result);
  });

  app.get("/posts/:txid/replies", async (req, res) => {
    const replies = await prisma.post.findMany({
      where: { parentTxid: req.params.txid, kind: KIND_TEXT_REPLY, status: { not: "evicted" } },
      orderBy: [{ blockHeight: "asc" }, { txid: "asc" }],
    });
    const result: StoredPost[] = replies.map((p) => ({
      txid: p.txid,
      blockHeight: p.blockHeight,
      timestamp: p.timestamp,
      content: p.content,
      kind: p.kind,
      pubkey: p.pubkey,
      sig: p.sig,
      parentTxid: p.parentTxid,
      status: p.status,
    }));
    res.json({ posts: result });
  });

  app.post("/notify", requireInternalToken, async (req, res) => {
    const { txid, block_height, timestamp, content, kind, pubkey, sig, propertyKind, value, parentTxid, targetPubkey, isFollow } =
      req.body as {
        txid: string;
        block_height: number;
        timestamp: number;
        content: string;
        kind: number;
        pubkey: string;
        sig: string;
        propertyKind?: number;
        value?: string;
        parentTxid?: string;
        targetPubkey?: string;
        isFollow?: boolean;
      };

    if (!txid || !pubkey || !sig) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Verify Schnorr signature before storing
    try {
      const pubkeyBuf = Buffer.from(pubkey, "hex");
      const sigBuf = Buffer.from(sig, "hex");
      let unsigned: Buffer;
      if (kind === KIND_PROFILE_UPDATE && typeof propertyKind === "number" && value !== undefined) {
        unsigned = buildProfileUpdateUnsignedPayload(propertyKind, value, pubkeyBuf);
      } else if (kind === KIND_TEXT_REPLY && parentTxid) {
        unsigned = buildReplyUnsignedPayload(content ?? "", pubkeyBuf, Buffer.from(parentTxid, "hex"));
      } else if (kind === KIND_REPOST && parentTxid) {
        unsigned = buildRepostUnsignedPayload(pubkeyBuf, Buffer.from(parentTxid, "hex"));
      } else if (kind === KIND_QUOTE_REPOST && parentTxid) {
        unsigned = buildQuoteRepostUnsignedPayload(content ?? "", pubkeyBuf, Buffer.from(parentTxid, "hex"));
      } else if (kind === KIND_FOLLOW && targetPubkey !== undefined && typeof isFollow === "boolean") {
        unsigned = buildFollowUnsignedPayload(Buffer.from(targetPubkey, "hex"), isFollow, pubkeyBuf);
      } else {
        unsigned = buildUnsignedPayload(content ?? "", pubkeyBuf);
      }
      const msgHash = crypto.createHash("sha256").update(unsigned).digest();
      let valid = tinysecp.verifySchnorr(msgHash, pubkeyBuf, sigBuf);
      if (!valid) {
        // Retry with v1 signing body (strip 4-byte MAGIC prefix)
        const v1Hash = crypto.createHash("sha256").update(unsigned.subarray(4)).digest();
        valid = tinysecp.verifySchnorr(v1Hash, pubkeyBuf, sigBuf);
        if (valid) console.log("[cache] /notify: accepted as v1 sig, kind=", kind);
      }
      if (!valid) {
        console.error("[cache] /notify: invalid sig, kind=", kind, "pubkey=", pubkey.slice(0, 8));
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (kind === KIND_PROFILE_UPDATE && typeof propertyKind === "number" && value !== undefined) {
      const data: { name?: string; avatarUrl?: string; bio?: string } = {};
      if (propertyKind === 0x00) data.name = value;
      else if (propertyKind === 0x01) data.avatarUrl = value;
      else if (propertyKind === 0x02) data.bio = value;

      if (Object.keys(data).length > 0) {
        await prisma.profile.upsert({
          where: { pubkey },
          create: { pubkey, ...data, status: "pending" },
          update: { ...data, status: "pending" },
        });
      }
    } else if (kind === KIND_FOLLOW && targetPubkey !== undefined && typeof isFollow === "boolean") {
      await prisma.follow.upsert({
        where: { followerPubkey_followeePubkey: { followerPubkey: pubkey, followeePubkey: targetPubkey } },
        create: {
          followerPubkey: pubkey,
          followeePubkey: targetPubkey,
          txid,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          blockHeight: block_height ?? 0,
          isFollow,
          status: "pending",
        },
        update: { isFollow, timestamp: timestamp ?? Math.floor(Date.now() / 1000), blockHeight: block_height ?? 0, txid, status: "pending" },
      });
    } else {
      if (content === undefined) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      await prisma.post.upsert({
        where: { txid },
        create: {
          txid,
          blockHeight: block_height ?? 0,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          content,
          kind: kind ?? 1,
          pubkey,
          sig,
          parentTxid: parentTxid ?? null,
          status: "pending",
        },
        update: {
          blockHeight: block_height ?? 0,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        },
      });
    }

    res.json({ ok: true });
  });

  app.get("/follows/:pubkey", async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: { followerPubkey: req.params.pubkey, isFollow: true, status: { not: "evicted" } },
    });
    const pubkeys = rows.filter((r) => r.status === "confirmed").map((r) => r.followeePubkey);
    const pendingPubkeys = rows.filter((r) => r.status === "pending").map((r) => r.followeePubkey);
    const follows = rows.map((r) => ({ pubkey: r.followeePubkey, txid: r.txid, blockHeight: r.blockHeight, status: r.status }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/followers/:pubkey", async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: { followeePubkey: req.params.pubkey, isFollow: true, status: { not: "evicted" } },
    });
    const pubkeys = rows.filter((r) => r.status === "confirmed").map((r) => r.followerPubkey);
    const pendingPubkeys = rows.filter((r) => r.status === "pending").map((r) => r.followerPubkey);
    const follows = rows.map((r) => ({ pubkey: r.followerPubkey, txid: r.txid, blockHeight: r.blockHeight, status: r.status }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/profiles", async (_req, res) => {
    const profiles = await prisma.profile.findMany();
    const result: StoredProfile[] = profiles.map((p) => ({
      pubkey: p.pubkey,
      name: p.name,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      status: p.status,
    }));
    res.json({ profiles: result });
  });

  app.get("/og", async (_req, res) => {
    const grouped = await prisma.post.groupBy({
      by: ["pubkey"],
      where: { status: "confirmed" },
      _min: { timestamp: true },
      orderBy: { _min: { timestamp: "asc" } },
    });
    const leaderboard = grouped.map((row, i) => ({
      pubkey: row.pubkey,
      rank: i + 1,
      firstTimestamp: row._min.timestamp!,
    }));
    res.json({ leaderboard });
  });

  app.get("/og/notes", async (_req, res) => {
    const notes = await prisma.post.findMany({
      where: { status: "confirmed", kind: 1 },
      orderBy: [{ timestamp: "asc" }, { txid: "asc" }],
      select: { txid: true, timestamp: true, pubkey: true, content: true },
    });
    const ranked = notes.map((n, i) => ({ txid: n.txid, rank: i + 1, timestamp: n.timestamp, pubkey: n.pubkey, content: n.content }));
    res.json({ notes: ranked });
  });

  app.post("/rescan", requireInternalToken, async (req, res) => {
    const { from_block } = req.body as { from_block: number };
    if (typeof from_block !== "number") {
      res.status(400).json({ error: "from_block must be a number" });
      return;
    }
    await rescanFrom(from_block);
    res.json({ ok: true });
  });

  return app;
}
