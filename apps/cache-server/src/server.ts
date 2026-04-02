import crypto from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
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
  PROFILE_PROPERTY_NAME,
  PROFILE_PROPERTY_AVATAR_URL,
  PROFILE_PROPERTY_BIO,
  PROFILE_PROPERTY_BOT,
} from "@opreturnsocial/protocol";
import { Prisma } from "../generated/client/index.js";
import { prisma } from "./db.js";
import { rescanFrom } from "./scanner.js";
import type { StoredPost, StoredProfile, StoredActivityItem } from "./types.js";

const INTERNAL_TOKEN = process.env.CACHE_INTERNAL_TOKEN ?? "";
const FREE_NETWORK = process.env.FREE_NETWORK ?? "mutinynet";

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
  // Used by the facilitator as the free network spam gate.
  app.get("/pubkey/:pubkey/mainnet-active", async (req, res) => {
    const { pubkey } = req.params;
    const [post, profile] = await Promise.all([
      prisma.post.findFirst({
        where: { pubkey, network: "mainnet", status: "confirmed" },
      }),
      prisma.profile.findFirst({
        where: { pubkey, network: "mainnet", status: "confirmed" },
      }),
    ]);
    res.json({ active: post !== null || profile !== null });
  });

  app.get("/posts", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const pubkey = req.query.pubkey as string | undefined;

    const whereBase = pubkey
      ? { pubkey, status: { not: "evicted" } }
      : { status: { not: "evicted" } };

    const posts = await prisma.post.findMany({
      where: { ...whereBase, network: { in: ["mainnet", FREE_NETWORK] } },
      orderBy: [{ timestamp: "desc" }, { txid: "asc" }],
      take: limit + offset,
    });

    // Deduplicate: if the same sig exists on both networks, keep only the mainnet version
    const mainnetSigs = new Set(
      posts.filter((p) => p.network === "mainnet").map((p) => p.sig),
    );
    const deduped = posts.filter(
      (p) => p.network === "mainnet" || !mainnetSigs.has(p.sig),
    );

    const page = deduped.slice(offset, offset + limit);

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
    // Try mainnet first, then free network
    const post =
      (await prisma.post.findFirst({ where: { txid, network: "mainnet" } })) ??
      (await prisma.post.findFirst({ where: { txid, network: FREE_NETWORK } }));
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
    // Replies can be on any network. Mainnet replies first, then free network.
    const replies = await prisma.post.findMany({
      where: {
        parentTxid: req.params.txid,
        kind: KIND_TEXT_REPLY,
        status: { not: "evicted" },
        network: { in: ["mainnet", FREE_NETWORK] },
      },
      orderBy: [{ network: "asc" }, { blockHeight: "asc" }, { txid: "asc" }],
    });
    // Deduplicate: keep mainnet version when same sig exists on both networks
    const repliesMainnetSigs = new Set(
      replies.filter((r) => r.network === "mainnet").map((r) => r.sig),
    );
    const dedupedReplies = replies.filter(
      (r) => r.network === "mainnet" || !repliesMainnetSigs.has(r.sig),
    );
    const dedupedTxids = dedupedReplies.map((p) => p.txid);
    const counts = await getCountsForTxids(dedupedTxids);
    const result: (StoredPost & {
      network: string;
      replyCount: number;
      repostCount: number;
    })[] = dedupedReplies.map((p) => ({
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
      ...(counts[p.txid] ?? { replyCount: 0, repostCount: 0 }),
    }));
    res.json({ posts: result });
  });

  app.post("/notify", requireInternalToken, async (req, res) => {
    const {
      txid,
      block_height,
      timestamp,
      content,
      kind,
      pubkey,
      sig,
      propertyKind,
      value,
      parentTxid,
      targetPubkey,
      isFollow,
      network: reqNetwork,
    } = req.body as {
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

    const network = (
      reqNetwork === FREE_NETWORK ? FREE_NETWORK : "mainnet"
    ) as string;

    if (!txid || !pubkey || !sig) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Verify Schnorr signature before storing
    try {
      const pubkeyBuf = Buffer.from(pubkey, "hex");
      const sigBuf = Buffer.from(sig, "hex");
      let unsigned: Uint8Array;
      if (
        kind === KIND_PROFILE_UPDATE &&
        typeof propertyKind === "number" &&
        value !== undefined
      ) {
        const profileValue: string | Uint8Array =
          propertyKind === PROFILE_PROPERTY_BOT
            ? new Uint8Array([value === "true" ? 0x01 : 0x00])
            : value;
        unsigned = buildProfileUpdateUnsignedPayload(
          propertyKind,
          profileValue,
          pubkeyBuf,
        );
      } else if (kind === KIND_TEXT_REPLY && parentTxid) {
        unsigned = buildReplyUnsignedPayload(
          content ?? "",
          pubkeyBuf,
          Buffer.from(parentTxid, "hex"),
        );
      } else if (kind === KIND_REPOST && parentTxid) {
        unsigned = buildRepostUnsignedPayload(
          pubkeyBuf,
          Buffer.from(parentTxid, "hex"),
        );
      } else if (kind === KIND_QUOTE_REPOST && parentTxid) {
        unsigned = buildQuoteRepostUnsignedPayload(
          content ?? "",
          pubkeyBuf,
          Buffer.from(parentTxid, "hex"),
        );
      } else if (
        kind === KIND_FOLLOW &&
        targetPubkey !== undefined &&
        typeof isFollow === "boolean"
      ) {
        unsigned = buildFollowUnsignedPayload(
          Buffer.from(targetPubkey, "hex"),
          isFollow,
          pubkeyBuf,
        );
      } else {
        unsigned = buildUnsignedPayload(content ?? "", pubkeyBuf);
      }
      const msgHash = crypto.createHash("sha256").update(unsigned).digest();
      let valid = tinysecp.verifySchnorr(msgHash, pubkeyBuf, sigBuf);
      if (!valid) {
        const v1Hash = crypto
          .createHash("sha256")
          .update(unsigned.subarray(4))
          .digest();
        valid = tinysecp.verifySchnorr(v1Hash, pubkeyBuf, sigBuf);
        if (valid)
          console.log("[cache] /notify: accepted as v1 sig, kind=", kind);
      }
      if (!valid) {
        console.error(
          "[cache] /notify: invalid sig, kind=",
          kind,
          "pubkey=",
          pubkey.slice(0, 8),
        );
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (
      kind === KIND_PROFILE_UPDATE &&
      typeof propertyKind === "number" &&
      value !== undefined
    ) {
      const data: {
        name?: string;
        avatarUrl?: string;
        bio?: string;
        bot?: boolean;
      } = {};
      if (propertyKind === PROFILE_PROPERTY_NAME) data.name = value;
      else if (propertyKind === PROFILE_PROPERTY_AVATAR_URL)
        data.avatarUrl = value;
      else if (propertyKind === PROFILE_PROPERTY_BIO) data.bio = value;
      else if (propertyKind === PROFILE_PROPERTY_BOT)
        data.bot = value === "true";

      if (Object.keys(data).length > 0) {
        await prisma.profile.upsert({
          where: { pubkey_network: { pubkey, network } },
          create: { pubkey, network, ...data, status: "pending" },
          update: { ...data },
        });
        await prisma.profileUpdateEvent.upsert({
          where: { txid_network: { txid, network } },
          create: {
            txid,
            network,
            pubkey,
            propertyKind,
            value,
            sig,
            blockHeight: block_height ?? 0,
            timestamp: timestamp ?? Math.floor(Date.now() / 1000),
            status: "pending",
          },
          update: {
            sig,
            blockHeight: block_height ?? 0,
            timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          },
        });
      }
    } else if (
      kind === KIND_FOLLOW &&
      targetPubkey !== undefined &&
      typeof isFollow === "boolean"
    ) {
      await prisma.follow.upsert({
        where: {
          followerPubkey_followeePubkey_network: {
            followerPubkey: pubkey,
            followeePubkey: targetPubkey,
            network,
          },
        },
        create: {
          followerPubkey: pubkey,
          followeePubkey: targetPubkey,
          network,
          txid,
          sig,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          blockHeight: block_height ?? 0,
          isFollow,
          status: "pending",
        },
        update: {
          isFollow,
          sig,
          timestamp: timestamp ?? Math.floor(Date.now() / 1000),
          blockHeight: block_height ?? 0,
          txid,
        },
      });
    } else {
      if (content === undefined) {
        res.status(400).json({ error: "Missing required fields" });
        return;
      }
      await prisma.post.upsert({
        where: { txid_network: { txid, network } },
        create: {
          txid,
          network,
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
      where: {
        followerPubkey: req.params.pubkey,
        isFollow: true,
        status: { not: "evicted" },
        network: { in: ["mainnet", FREE_NETWORK] },
      },
    });
    const pubkeys = rows
      .filter((r) => r.status === "confirmed")
      .map((r) => r.followeePubkey);
    const pendingPubkeys = rows
      .filter((r) => r.status === "pending")
      .map((r) => r.followeePubkey);
    const followsMap = new Map<string, (typeof rows)[0]>();
    for (const r of rows) {
      const existing = followsMap.get(r.followeePubkey);
      if (!existing || r.network === "mainnet")
        followsMap.set(r.followeePubkey, r);
    }
    const follows = Array.from(followsMap.values()).map((r) => ({
      pubkey: r.followeePubkey,
      txid: r.txid,
      blockHeight: r.blockHeight,
      status: r.status,
      network: r.network,
    }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/followers/:pubkey", async (req, res) => {
    const rows = await prisma.follow.findMany({
      where: {
        followeePubkey: req.params.pubkey,
        isFollow: true,
        status: { not: "evicted" },
        network: { in: ["mainnet", FREE_NETWORK] },
      },
    });
    const pubkeys = rows
      .filter((r) => r.status === "confirmed")
      .map((r) => r.followerPubkey);
    const pendingPubkeys = rows
      .filter((r) => r.status === "pending")
      .map((r) => r.followerPubkey);
    const followsMap = new Map<string, (typeof rows)[0]>();
    for (const r of rows) {
      const existing = followsMap.get(r.followerPubkey);
      if (!existing || r.network === "mainnet")
        followsMap.set(r.followerPubkey, r);
    }
    const follows = Array.from(followsMap.values()).map((r) => ({
      pubkey: r.followerPubkey,
      txid: r.txid,
      blockHeight: r.blockHeight,
      status: r.status,
      network: r.network,
    }));
    res.json({ pubkeys, pendingPubkeys, follows });
  });

  app.get("/profiles", async (_req, res) => {
    // Build profiles field-by-field from events, latest timestamp wins per (pubkey, propertyKind)
    const allEvents = await prisma.profileUpdateEvent.findMany({
      where: {
        network: { in: ["mainnet", FREE_NETWORK] },
        status: { not: "evicted" },
      },
      orderBy: [{ timestamp: "desc" }, { network: "asc" }],
    });

    // First occurrence of each (pubkey, propertyKind) key = latest (sorted desc above)
    const latestByPubkeyAndKind = new Map<string, (typeof allEvents)[0]>();
    for (const e of allEvents) {
      const key = `${e.pubkey}:${e.propertyKind}`;
      if (!latestByPubkeyAndKind.has(key)) latestByPubkeyAndKind.set(key, e);
    }

    // Aggregate into per-pubkey profile objects
    const profileMap = new Map<string, StoredProfile>();
    for (const event of latestByPubkeyAndKind.values()) {
      const p: StoredProfile = profileMap.get(event.pubkey) ?? {
        pubkey: event.pubkey,
        name: null,
        bio: null,
        avatarUrl: null,
        bot: null,
        status: event.status,
      };
      if (event.propertyKind === PROFILE_PROPERTY_NAME) p.name = event.value;
      else if (event.propertyKind === PROFILE_PROPERTY_AVATAR_URL)
        p.avatarUrl = event.value;
      else if (event.propertyKind === PROFILE_PROPERTY_BIO) p.bio = event.value;
      else if (event.propertyKind === PROFILE_PROPERTY_BOT)
        p.bot = event.value === "true";
      profileMap.set(event.pubkey, p);
    }

    res.json({ profiles: Array.from(profileMap.values()) });
  });

  async function getCountsForTxids(
    txids: string[],
  ): Promise<Record<string, { replyCount: number; repostCount: number }>> {
    if (txids.length === 0) return {};
    const [repliers, reposters] = await Promise.all([
      prisma.post.groupBy({
        by: ["parentTxid"],
        where: {
          kind: KIND_TEXT_REPLY,
          parentTxid: { in: txids },
          network: { in: ["mainnet", FREE_NETWORK] },
        },
        _count: { txid: true },
      }),
      prisma.post.groupBy({
        by: ["parentTxid"],
        where: {
          kind: { in: [KIND_REPOST, KIND_QUOTE_REPOST] },
          parentTxid: { in: txids },
          network: { in: ["mainnet", FREE_NETWORK] },
        },
        _count: { txid: true },
      }),
    ]);
    const result: Record<string, { replyCount: number; repostCount: number }> =
      {};
    for (const txid of txids) result[txid] = { replyCount: 0, repostCount: 0 };
    for (const r of repliers)
      if (r.parentTxid)
        result[r.parentTxid] = {
          ...result[r.parentTxid],
          replyCount: r._count.txid,
        };
    for (const r of reposters)
      if (r.parentTxid)
        result[r.parentTxid] = {
          ...result[r.parentTxid],
          repostCount: r._count.txid,
        };
    return result;
  }

  async function attachCounts(
    items: Omit<StoredActivityItem, "replyCount" | "repostCount">[],
  ): Promise<StoredActivityItem[]> {
    const txids = items.map((i) => i.txid);
    if (txids.length === 0)
      return items.map((i) => ({ ...i, replyCount: 0, repostCount: 0 }));
    const counts = await getCountsForTxids(txids);
    return items.map((i) => ({
      ...i,
      ...(counts[i.txid] ?? { replyCount: 0, repostCount: 0 }),
    }));
  }

  // Unified feed endpoint: merges posts + activity items, sorted by timestamp.
  // ?viewer=X  → following feed (posts/activity by users X follows, resolved server-side)
  // ?pubkey=X  → profile feed (posts/activity by user X)
  // (none)     → global feed
  app.get("/feed", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 20), 200);
    const offset = Number(req.query.offset ?? 0);
    const pubkey = req.query.pubkey as string | undefined;
    const viewer = req.query.viewer as string | undefined;
    const feedFilter = (req.query.feedFilter as string) ?? "posts";
    // Resolve which pubkeys to filter by
    let filterPubkeys: string[] | undefined;
    let filterSinglePubkey: string | undefined;

    if (viewer) {
      const viewerFollows = await prisma.follow.findMany({
        where: {
          followerPubkey: viewer,
          isFollow: true,
          status: { not: "evicted" },
          network: { in: ["mainnet", FREE_NETWORK] },
        },
        select: { followeePubkey: true },
      });
      filterPubkeys = [...new Set(viewerFollows.map((f) => f.followeePubkey))];
      if (filterPubkeys.length === 0) {
        res.json({ items: [] });
        return;
      }
    } else if (pubkey) {
      filterSinglePubkey = pubkey;
    }

    type RawItem = {
      feedType: "post" | "activity";
      timestamp: number;
      txid: string;
      data: Record<string, unknown>;
    };

    let page: RawItem[];
    let hasMore: boolean;

    const includeActivity = feedFilter === "all";

    if (!includeActivity) {
      // Posts-only: raw SQL with DB-level OFFSET/LIMIT and cross-network dedup via NOT EXISTS.
      // This ensures each page always fetches exactly limit+1 rows regardless of page number.
      const kindFilter =
        feedFilter === "posts"
          ? Prisma.sql`AND p.kind != ${KIND_TEXT_REPLY}`
          : Prisma.empty;
      const pubkeyFilter = filterPubkeys
        ? Prisma.sql`AND p.pubkey IN (${Prisma.join(filterPubkeys)})`
        : filterSinglePubkey
          ? Prisma.sql`AND p.pubkey = ${filterSinglePubkey}`
          : Prisma.empty;

      const rawPosts = await prisma.$queryRaw<{
        txid: string;
        network: string;
        blockHeight: bigint;
        timestamp: bigint;
        content: string;
        kind: bigint;
        pubkey: string;
        sig: string;
        parentTxid: string | null;
        status: string;
      }[]>`
        SELECT p.*
        FROM "Post" p
        WHERE p.status != 'evicted'
          AND p.network IN ('mainnet', ${FREE_NETWORK})
          AND NOT (
            p.network != 'mainnet'
            AND EXISTS (
              SELECT 1 FROM "Post" p2
              WHERE p2.sig = p.sig
                AND p2.network = 'mainnet'
                AND p2.status != 'evicted'
            )
          )
          ${kindFilter}
          ${pubkeyFilter}
        ORDER BY p.timestamp DESC, p.txid ASC
        LIMIT ${limit + 1} OFFSET ${offset}
      `;

      hasMore = rawPosts.length > limit;
      page = rawPosts.slice(0, limit).map((p) => ({
        feedType: "post" as const,
        timestamp: Number(p.timestamp),
        txid: p.txid,
        data: {
          feedType: "post",
          txid: p.txid,
          network: p.network,
          blockHeight: Number(p.blockHeight),
          timestamp: Number(p.timestamp),
          content: p.content,
          kind: Number(p.kind),
          pubkey: p.pubkey,
          sig: p.sig,
          parentTxid: p.parentTxid,
          status: p.status,
        },
      }));
    } else {
      // Activity mode: UNION ALL of posts + follows + profile updates with DB-level dedup
      // and pagination. Each source deduplicates via NOT EXISTS (mainnet wins on same key).
      const pubkeyFilterPost = filterPubkeys
        ? Prisma.sql`AND p.pubkey IN (${Prisma.join(filterPubkeys)})`
        : filterSinglePubkey
          ? Prisma.sql`AND p.pubkey = ${filterSinglePubkey}`
          : Prisma.empty;
      const pubkeyFilterFollow = filterPubkeys
        ? Prisma.sql`AND f.followerPubkey IN (${Prisma.join(filterPubkeys)})`
        : filterSinglePubkey
          ? Prisma.sql`AND f.followerPubkey = ${filterSinglePubkey}`
          : Prisma.empty;
      const pubkeyFilterProfile = filterPubkeys
        ? Prisma.sql`AND e.pubkey IN (${Prisma.join(filterPubkeys)})`
        : filterSinglePubkey
          ? Prisma.sql`AND e.pubkey = ${filterSinglePubkey}`
          : Prisma.empty;

      const rawItems = await prisma.$queryRaw<{
        feedType: string;
        activityType: string | null;
        txid: string;
        network: string;
        blockHeight: bigint;
        timestamp: bigint;
        status: string;
        sig: string;
        pubkey: string;
        content: string | null;
        kind: bigint | null;
        parentTxid: string | null;
        targetPubkey: string | null;
        propertyKind: bigint | null;
        value: string | null;
      }[]>`
        SELECT
          'post'    AS feedType,
          NULL      AS activityType,
          p.txid, p.network, p.blockHeight, p.timestamp, p.status, p.sig,
          p.pubkey, p.content, p.kind, p.parentTxid,
          NULL AS targetPubkey, NULL AS propertyKind, NULL AS value
        FROM "Post" p
        WHERE p.status != 'evicted'
          AND p.network IN ('mainnet', ${FREE_NETWORK})
          AND NOT (
            p.network != 'mainnet'
            AND EXISTS (
              SELECT 1 FROM "Post" p2
              WHERE p2.sig = p.sig
                AND p2.network = 'mainnet'
                AND p2.status != 'evicted'
            )
          )
          ${pubkeyFilterPost}

        UNION ALL

        SELECT
          'activity' AS feedType,
          CASE WHEN f.isFollow THEN 'follow' ELSE 'unfollow' END AS activityType,
          f.txid, f.network, f.blockHeight, f.timestamp, f.status, f.sig,
          f.followerPubkey AS pubkey, NULL AS content, NULL AS kind, NULL AS parentTxid,
          f.followeePubkey AS targetPubkey, NULL AS propertyKind, NULL AS value
        FROM "Follow" f
        WHERE f.status != 'evicted'
          AND f.network IN ('mainnet', ${FREE_NETWORK})
          AND NOT (
            f.network != 'mainnet'
            AND EXISTS (
              SELECT 1 FROM "Follow" f2
              WHERE f2.followerPubkey = f.followerPubkey
                AND f2.followeePubkey = f.followeePubkey
                AND f2.network = 'mainnet'
                AND f2.status != 'evicted'
            )
          )
          ${pubkeyFilterFollow}

        UNION ALL

        SELECT
          'activity'       AS feedType,
          'profile_update' AS activityType,
          e.txid, e.network, e.blockHeight, e.timestamp, e.status, e.sig,
          e.pubkey, NULL AS content, NULL AS kind, NULL AS parentTxid,
          NULL AS targetPubkey, e.propertyKind, e.value
        FROM "ProfileUpdateEvent" e
        WHERE e.status != 'evicted'
          AND e.network IN ('mainnet', ${FREE_NETWORK})
          AND NOT (
            e.network != 'mainnet'
            AND EXISTS (
              SELECT 1 FROM "ProfileUpdateEvent" e2
              WHERE (
                (e.sig != '' AND e2.sig = e.sig) OR
                (e.sig = '' AND e2.txid = e.txid)
              )
              AND e2.network = 'mainnet'
              AND e2.status != 'evicted'
            )
          )
          ${pubkeyFilterProfile}

        ORDER BY timestamp DESC, txid ASC
        LIMIT ${limit + 1} OFFSET ${offset}
      `;

      hasMore = rawItems.length > limit;
      page = rawItems.slice(0, limit).map((row) => {
        if (row.feedType === "post") {
          return {
            feedType: "post" as const,
            timestamp: Number(row.timestamp),
            txid: row.txid,
            data: {
              feedType: "post",
              txid: row.txid,
              network: row.network,
              blockHeight: Number(row.blockHeight),
              timestamp: Number(row.timestamp),
              content: row.content,
              kind: Number(row.kind),
              pubkey: row.pubkey,
              sig: row.sig,
              parentTxid: row.parentTxid,
              status: row.status,
            },
          };
        } else if (row.activityType === "profile_update") {
          return {
            feedType: "activity" as const,
            timestamp: Number(row.timestamp),
            txid: row.txid,
            data: {
              feedType: "activity",
              type: "profile_update",
              txid: row.txid,
              network: row.network,
              pubkey: row.pubkey,
              timestamp: Number(row.timestamp),
              blockHeight: Number(row.blockHeight),
              status: row.status,
              propertyKind: Number(row.propertyKind),
              value: row.value,
            },
          };
        } else {
          return {
            feedType: "activity" as const,
            timestamp: Number(row.timestamp),
            txid: row.txid,
            data: {
              feedType: "activity",
              type: row.activityType,
              txid: row.txid,
              network: row.network,
              pubkey: row.pubkey,
              timestamp: Number(row.timestamp),
              blockHeight: Number(row.blockHeight),
              status: row.status,
              targetPubkey: row.targetPubkey,
            },
          };
        }
      });
    }

    // Attach reply/repost counts to all items
    const txids = page.map((i) => i.txid);
    const counts = await getCountsForTxids(txids);
    const items = page.map((i) => ({
      ...i.data,
      ...(counts[i.txid] ?? { replyCount: 0, repostCount: 0 }),
    }));

    // Collect parentTxids from posts on this page that aren't already in the page
    const pageTxids = new Set(page.map((i) => i.txid));
    const missingParentTxids = [
      ...new Set(
        page
          .filter(
            (i) =>
              i.feedType === "post" &&
              (i.data as { parentTxid?: string }).parentTxid,
          )
          .map((i) => (i.data as { parentTxid: string }).parentTxid)
          .filter((txid) => !pageTxids.has(txid)),
      ),
    ];

    let parentPosts: object[] = [];
    let parentActivities: object[] = [];

    if (missingParentTxids.length > 0) {
      // txids are chain-specific (determined by UTXOs), so no dedup needed across networks
      const [rawPosts, rawFollows, rawProfileUpdates] = await Promise.all([
        prisma.post.findMany({
          where: {
            txid: { in: missingParentTxids },
            network: { in: ["mainnet", FREE_NETWORK] },
          },
        }),
        prisma.follow.findMany({
          where: {
            txid: { in: missingParentTxids },
            network: { in: ["mainnet", FREE_NETWORK] },
          },
        }),
        prisma.profileUpdateEvent.findMany({
          where: {
            txid: { in: missingParentTxids },
            network: { in: ["mainnet", FREE_NETWORK] },
          },
        }),
      ]);

      parentPosts = rawPosts.map((p) => ({
        feedType: "post",
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

      parentActivities = [
        ...rawFollows.map((f) => ({
          feedType: "activity",
          type: f.isFollow ? "follow" : "unfollow",
          txid: f.txid,
          network: f.network,
          pubkey: f.followerPubkey,
          timestamp: f.timestamp,
          blockHeight: f.blockHeight,
          status: f.status,
          targetPubkey: f.followeePubkey,
        })),
        ...rawProfileUpdates.map((e) => ({
          feedType: "activity",
          type: "profile_update",
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
    }

    res.json({ items, parentPosts, parentActivities, hasMore });
  });

  app.get("/activity/:txid", async (req, res) => {
    const { txid } = req.params;

    const [follow, profileUpdate] = await Promise.all([
      prisma.follow.findFirst({
        where: { txid, network: { in: ["mainnet", FREE_NETWORK] } },
      }),
      prisma.profileUpdateEvent.findFirst({
        where: { txid, network: { in: ["mainnet", FREE_NETWORK] } },
      }),
    ]);

    let item: Omit<StoredActivityItem, "replyCount" | "repostCount"> | null =
      null;

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
    const type = req.query.type as string | undefined;

    const networkFilter = {
      status: { not: "evicted" as const },
      network: { in: ["mainnet", FREE_NETWORK] },
    };
    const [follows, profileUpdates] = await Promise.all([
      type === "profile_update"
        ? Promise.resolve([])
        : prisma.follow.findMany({
            where: pubkey
              ? { followerPubkey: pubkey, ...networkFilter }
              : networkFilter,
          }),
      type === "follow"
        ? Promise.resolve([])
        : prisma.profileUpdateEvent.findMany({
            where: pubkey ? { pubkey, ...networkFilter } : networkFilter,
          }),
    ]);

    // Deduplicate follows: mainnet wins when same follower+followee exists on both networks
    const followsMap = new Map<string, (typeof follows)[0]>();
    for (const f of follows) {
      const key = `${f.followerPubkey}:${f.followeePubkey}`;
      const existing = followsMap.get(key);
      if (!existing || f.network === "mainnet") followsMap.set(key, f);
    }
    const dedupedFollows = Array.from(followsMap.values());

    // Deduplicate profile updates: mainnet wins when same sig exists on both networks
    const profileUpdatesMap = new Map<string, (typeof profileUpdates)[0]>();
    for (const e of profileUpdates) {
      // TODO: remove e.txid from key after full rescan on production
      const key = e.sig || e.txid;
      const existing = profileUpdatesMap.get(key);
      if (!existing || e.network === "mainnet") profileUpdatesMap.set(key, e);
    }
    const dedupedProfileUpdates = Array.from(profileUpdatesMap.values());

    const rawItems: Omit<StoredActivityItem, "replyCount" | "repostCount">[] = [
      ...dedupedFollows.map((f) => ({
        type: (f.isFollow ? "follow" : "unfollow") as "follow" | "unfollow",
        txid: f.txid,
        network: f.network,
        pubkey: f.followerPubkey,
        timestamp: f.timestamp,
        blockHeight: f.blockHeight,
        status: f.status,
        targetPubkey: f.followeePubkey,
      })),
      ...dedupedProfileUpdates.map((e) => ({
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

    rawItems.sort(
      (a, b) => b.timestamp - a.timestamp || a.txid.localeCompare(b.txid),
    );
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
    const ranked = notes.map((n, i) => ({
      txid: n.txid,
      rank: i + 1,
      timestamp: n.timestamp,
      pubkey: n.pubkey,
      content: n.content,
    }));
    res.json({ notes: ranked });
  });

  app.get("/rep", async (_req, res) => {
    // Rep leaderboard: mainnet_txs + sum(follower.mainnet_txs * 0.5)
    const [txCounts, follows] = await Promise.all([
      prisma.post.groupBy({
        by: ["pubkey"],
        where: { status: "confirmed", network: "mainnet" },
        _count: { _all: true },
      }),
      prisma.follow.findMany({
        where: { status: "confirmed", network: "mainnet", isFollow: true },
        select: { followerPubkey: true, followeePubkey: true },
      }),
    ]);

    const txMap = new Map<string, number>(
      txCounts.map((r) => [r.pubkey, r._count._all]),
    );

    // Seed rep with own tx counts
    const repMap = new Map<string, number>();
    for (const [pubkey, count] of txMap) {
      repMap.set(pubkey, count);
    }

    // Add follower boost
    for (const follow of follows) {
      const followerTxs = txMap.get(follow.followerPubkey) ?? 0;
      if (followerTxs === 0) continue;
      const current = repMap.get(follow.followeePubkey) ?? 0;
      repMap.set(follow.followeePubkey, current + followerTxs * 0.5);
    }

    const leaderboard = Array.from(repMap.entries())
      .map(([pubkey, rep]) => ({ pubkey, rep: Math.round(rep) }))
      .sort((a, b) => b.rep - a.rep || a.pubkey.localeCompare(b.pubkey))
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    res.json({ leaderboard });
  });

  app.post("/rescan", requireInternalToken, async (req, res) => {
    const { from_block, network } = req.body as {
      from_block: number;
      network?: string;
    };
    if (typeof from_block !== "number") {
      res.status(400).json({ error: "from_block must be a number" });
      return;
    }
    await rescanFrom(from_block, network ?? "mainnet");
    res.json({ ok: true });
  });

  return app;
}
