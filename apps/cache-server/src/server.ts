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
import type { StoredPost, StoredProfile, StoredActivityItem } from "./types.js";

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

  // Returns whether a pubkey has at least 1 confirmed mainnet post or profile update.
  // Used by the facilitator as the testnet4 spam gate.
  app.get("/pubkey/:pubkey/mainnet-active", async (req, res) => {
    const { pubkey } = req.params;
    const [post, profile] = await Promise.all([
      prisma.post.findFirst({ where: { pubkey, network: "mainnet", status: "confirmed" } }),
      prisma.profile.findFirst({ where: { pubkey, network: "mainnet", status: "confirmed" } }),
    ]);
    res.json({ active: post !== null || profile !== null });
  });

  app.get("/posts", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const pubkey = req.query.pubkey as string | undefined;

    // Fetch mainnet and testnet4 posts separately so we can interleave with mainnet priority.
    // Within each network, order by timestamp DESC. Mainnet posts take precedence at same timestamp.
    const whereBase = pubkey ? { pubkey, status: { not: "evicted" } } : { status: { not: "evicted" } };

    const [mainnetPosts, testnet4Posts] = await Promise.all([
      prisma.post.findMany({
        where: { ...whereBase, network: "mainnet" },
        orderBy: [{ timestamp: "desc" }, { txid: "asc" }],
        take: limit + offset,
      }),
      prisma.post.findMany({
        where: { ...whereBase, network: "testnet4" },
        orderBy: [{ timestamp: "desc" }, { txid: "asc" }],
        take: limit + offset,
      }),
    ]);

    // Merge: interleave by timestamp descending, mainnet wins ties
    const merged: typeof mainnetPosts = [];
    let mi = 0, ti = 0;
    while (merged.length < limit + offset && (mi < mainnetPosts.length || ti < testnet4Posts.length)) {
      const m = mainnetPosts[mi];
      const t = testnet4Posts[ti];
      if (!t || (m && m.timestamp >= t.timestamp)) {
        merged.push(m);
        mi++;
      } else {
        merged.push(t);
        ti++;
      }
    }

    const page = merged.slice(offset, offset + limit);

    const result: (StoredPost & { network: string })[] = page.map((p) => ({
      txid: p.txid,
      network: p.network,
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
    const { txid } = req.params;
    // Try mainnet first, then testnet4
    const post =
      (await prisma.post.findFirst({ where: { txid, network: "mainnet" } })) ??
      (await prisma.post.findFirst({ where: { txid, network: "testnet4" } }));
    if (!post) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result: StoredPost & { network: string } = {
      txid: post.txid,
      network: post.network,
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
    // Replies can be on any network. Mainnet replies first, then testnet4.
    const replies = await prisma.post.findMany({
      where: { parentTxid: req.params.txid, kind: KIND_TEXT_REPLY, status: { not: "evicted" } },
      orderBy: [{ network: "asc" }, { blockHeight: "asc" }, { txid: "asc" }],
    });
    const result: (StoredPost & { network: string })[] = replies.map((p) => ({
      txid: p.txid,
      network: p.network,
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
    const { txid, block_height, timestamp, content, kind, pubkey, sig, propertyKind, value, parentTxid, targetPubkey, isFollow, network: reqNetwork } =
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
        network?: string;
      };

    const network = (reqNetwork === "testnet4" ? "testnet4" : "mainnet") as string;

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
          where: { pubkey_network: { pubkey, network } },
          create: { pubkey, network, ...data, status: "pending" },
          update: { ...data, status: "pending" },
        });
        await prisma.profileUpdateEvent.upsert({
          where: { txid_network: { txid, network } },
          create: { txid, network, pubkey, propertyKind, value, sig, blockHeight: block_height ?? 0, timestamp: timestamp ?? Math.floor(Date.now() / 1000), status: "pending" },
          update: { sig, blockHeight: block_height ?? 0, timestamp: timestamp ?? Math.floor(Date.now() / 1000), status: "pending" },
        });
      }
    } else if (kind === KIND_FOLLOW && targetPubkey !== undefined && typeof isFollow === "boolean") {
      await prisma.follow.upsert({
        where: { followerPubkey_followeePubkey_network: { followerPubkey: pubkey, followeePubkey: targetPubkey, network } },
        create: { followerPubkey: pubkey, followeePubkey: targetPubkey, network, txid, sig, timestamp: timestamp ?? Math.floor(Date.now() / 1000), blockHeight: block_height ?? 0, isFollow, status: "pending" },
        update: { isFollow, sig, timestamp: timestamp ?? Math.floor(Date.now() / 1000), blockHeight: block_height ?? 0, txid, status: "pending" },
      });
    } else {
      if (content === undefined) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      await prisma.post.upsert({
        where: { txid_network: { txid, network } },
        create: { txid, network, blockHeight: block_height ?? 0, timestamp: timestamp ?? Math.floor(Date.now() / 1000), content, kind: kind ?? 1, pubkey, sig, parentTxid: parentTxid ?? null, status: "pending" },
        update: { blockHeight: block_height ?? 0, timestamp: timestamp ?? Math.floor(Date.now() / 1000) },
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
    const followsMap = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const existing = followsMap.get(r.followeePubkey);
      if (!existing || r.network === "mainnet") followsMap.set(r.followeePubkey, r);
    }
    const follows = Array.from(followsMap.values()).map((r) => ({ pubkey: r.followeePubkey, txid: r.txid, blockHeight: r.blockHeight, status: r.status, network: r.network }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/followers/:pubkey", async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: { followeePubkey: req.params.pubkey, isFollow: true, status: { not: "evicted" } },
    });
    const pubkeys = rows.filter((r) => r.status === "confirmed").map((r) => r.followerPubkey);
    const pendingPubkeys = rows.filter((r) => r.status === "pending").map((r) => r.followerPubkey);
    const followsMap = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const existing = followsMap.get(r.followerPubkey);
      if (!existing || r.network === "mainnet") followsMap.set(r.followerPubkey, r);
    }
    const follows = Array.from(followsMap.values()).map((r) => ({ pubkey: r.followerPubkey, txid: r.txid, blockHeight: r.blockHeight, status: r.status, network: r.network }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/profiles", async (_req, res) => {
    // Return merged profiles: mainnet wins, fall back to testnet4 for pubkeys with no mainnet profile
    const allProfiles = await prisma.profile.findMany();
    const byPubkey = new Map<string, typeof allProfiles[0]>();
    // Process testnet4 first, then mainnet overwrites (mainnet wins)
    for (const p of allProfiles) {
      if (p.network === "testnet4") {
        const existing = byPubkey.get(p.pubkey);
        if (!existing) byPubkey.set(p.pubkey, p);
      }
    }
    for (const p of allProfiles) {
      if (p.network === "mainnet") byPubkey.set(p.pubkey, p);
    }
    const result: StoredProfile[] = Array.from(byPubkey.values()).map((p) => ({
      pubkey: p.pubkey,
      name: p.name,
      bio: p.bio,
      avatarUrl: p.avatarUrl,
      status: p.status,
    }));
    res.json({ profiles: result });
  });

  async function attachCounts(items: Omit<StoredActivityItem, "replyCount" | "repostCount">[]): Promise<StoredActivityItem[]> {
    const txids = items.map((i) => i.txid);
    if (txids.length === 0) return items.map((i) => ({ ...i, replyCount: 0, repostCount: 0 }));

    const [repliers, reposters] = await Promise.all([
      prisma.post.groupBy({
        by: ["parentTxid"],
        where: { kind: KIND_TEXT_REPLY, parentTxid: { in: txids } },
        _count: { txid: true },
      }),
      prisma.post.groupBy({
        by: ["parentTxid"],
        where: { kind: { in: [KIND_REPOST, KIND_QUOTE_REPOST] }, parentTxid: { in: txids } },
        _count: { txid: true },
      }),
    ]);

    const replyCountMap: Record<string, number> = {};
    for (const r of repliers) if (r.parentTxid) replyCountMap[r.parentTxid] = r._count.txid;
    const repostCountMap: Record<string, number> = {};
    for (const r of reposters) if (r.parentTxid) repostCountMap[r.parentTxid] = r._count.txid;

    return items.map((i) => ({
      ...i,
      replyCount: replyCountMap[i.txid] ?? 0,
      repostCount: repostCountMap[i.txid] ?? 0,
    }));
  }

  app.get("/activity/:txid", async (req, res) => {
    const { txid } = req.params;

    const [follow, profileUpdate] = await Promise.all([
      prisma.follow.findFirst({ where: { txid } }),
      prisma.profileUpdateEvent.findFirst({ where: { txid } }),
    ]);

    let item: Omit<StoredActivityItem, "replyCount" | "repostCount"> | null = null;

    if (follow) {
      item = {
        type: follow.isFollow ? "follow" : "unfollow",
        txid: follow.txid,
        network: follow.network,
        pubkey: follow.followerPubkey,
        timestamp: follow.timestamp,
        blockHeight: follow.blockHeight,
        status: follow.status,
        targetPubkey: follow.followeePubkey,
        sig: follow.sig,
      };
    } else if (profileUpdate) {
      item = {
        type: "profile_update",
        txid: profileUpdate.txid,
        network: profileUpdate.network,
        pubkey: profileUpdate.pubkey,
        timestamp: profileUpdate.timestamp,
        blockHeight: profileUpdate.blockHeight,
        status: profileUpdate.status,
        propertyKind: profileUpdate.propertyKind,
        value: profileUpdate.value,
        sig: profileUpdate.sig,
      };
    }

    if (!item) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [withCounts] = await attachCounts([item]);
    res.json(withCounts);
  });

  app.get("/activity", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const pubkey = req.query.pubkey as string | undefined;

    const [follows, profileUpdates] = await Promise.all([
      prisma.follow.findMany({
        where: pubkey
          ? { followerPubkey: pubkey, status: { not: "evicted" } }
          : { status: { not: "evicted" } },
      }),
      prisma.profileUpdateEvent.findMany({
        where: pubkey
          ? { pubkey, status: { not: "evicted" } }
          : { status: { not: "evicted" } },
      }),
    ]);

    const rawItems: Omit<StoredActivityItem, "replyCount" | "repostCount">[] = [
      ...follows.map((f) => ({
        type: (f.isFollow ? "follow" : "unfollow") as "follow" | "unfollow",
        txid: f.txid,
        network: f.network,
        pubkey: f.followerPubkey,
        timestamp: f.timestamp,
        blockHeight: f.blockHeight,
        status: f.status,
        targetPubkey: f.followeePubkey,
      })),
      ...profileUpdates.map((e) => ({
        type: "profile_update" as const,
        txid: e.txid,
        network: e.network,
        pubkey: e.pubkey,
        timestamp: e.timestamp,
        blockHeight: e.blockHeight,
        status: e.status,
        propertyKind: e.propertyKind,
        value: e.value,
      })),
    ];

    rawItems.sort((a, b) => b.timestamp - a.timestamp || a.txid.localeCompare(b.txid));
    const pageRaw = rawItems.slice(offset, offset + limit);
    const page = await attachCounts(pageRaw);

    res.json({ items: page });
  });

  app.get("/og", async (_req, res) => {
    // OG leaderboard is mainnet-only
    const grouped = await prisma.post.groupBy({
      by: ["pubkey"],
      where: { status: "confirmed", network: "mainnet" },
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
      where: { status: "confirmed", kind: 1, network: "mainnet" },
      orderBy: [{ timestamp: "asc" }, { txid: "asc" }],
      select: { txid: true, timestamp: true, pubkey: true, content: true },
    });
    const ranked = notes.map((n, i) => ({ txid: n.txid, rank: i + 1, timestamp: n.timestamp, pubkey: n.pubkey, content: n.content }));
    res.json({ notes: ranked });
  });

  app.post("/rescan", requireInternalToken, async (req, res) => {
    const { from_block, network } = req.body as { from_block: number; network?: string };
    if (typeof from_block !== "number") {
      res.status(400).json({ error: "from_block must be a number" });
      return;
    }
    await rescanFrom(from_block, network ?? "mainnet");
    res.json({ ok: true });
  });

  return app;
}
