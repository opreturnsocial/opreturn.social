import { useState, useEffect, useCallback, useRef } from "react";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import type { Post, ActivityItem, FeedItem } from "../types";
import { fetchFeed } from "../api/cache";
import {
  buildUnsignedPayload,
  buildReplyUnsignedPayload,
  buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload,
  buildV1SigningBody,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
} from "../lib/ors";

const POLL_INTERVAL_MS = 5000;
const PAGE_SIZE = 10;

function verifyPost(post: Post): boolean {
  try {
    let unsigned: Uint8Array;
    if (post.kind === KIND_TEXT_REPLY && post.parentTxid) {
      unsigned = buildReplyUnsignedPayload(
        post.content,
        post.pubkey,
        post.parentTxid,
      );
    } else if (post.kind === KIND_REPOST && post.parentTxid) {
      unsigned = buildRepostUnsignedPayload(post.pubkey, post.parentTxid);
    } else if (post.kind === KIND_QUOTE_REPOST && post.parentTxid) {
      unsigned = buildQuoteRepostUnsignedPayload(
        post.content,
        post.pubkey,
        post.parentTxid,
      );
    } else {
      unsigned = buildUnsignedPayload(post.content, post.pubkey);
    }
    const msgHash = sha256(unsigned);
    if (schnorr.verify(post.sig, msgHash, post.pubkey)) return true;
    // Retry with v1 signing body (strip 4-byte MAGIC prefix)
    const v1Hash = sha256(buildV1SigningBody(unsigned));
    return schnorr.verify(post.sig, v1Hash, post.pubkey);
  } catch {
    return false;
  }
}

function verifyItem(item: FeedItem): boolean {
  if (item.feedType === "post") return verifyPost(item);
  return true; // activity items are not signature-verified
}

export function useFeed(filter?: { pubkey?: string; viewer?: string; feedFilter?: string }) {
  const filterKey = JSON.stringify(filter ?? {});

  const [items, setItems] = useState<FeedItem[]>([]);
  const [parentPosts, setParentPosts] = useState<Record<string, Post>>({});
  const [parentActivities, setParentActivities] = useState<Record<string, ActivityItem>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for synchronous guards - prevent concurrent fetches even before state commits
  const offsetRef = useRef(PAGE_SIZE);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  // Reset when filter changes (tab switch or navigation)
  useEffect(() => {
    setItems([]);
    setParentPosts({});
    setParentActivities({});
    setLoading(true);
    setHasMore(true);
    setError(null);
    offsetRef.current = PAGE_SIZE;
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const refresh = useCallback(async () => {
    try {
      const { items: data, parentPosts: pp, parentActivities: pa } = await fetchFeed(PAGE_SIZE, 0, filter);
      const verified = data.filter(verifyItem);
      setItems((prev) => {
        // Merge: keep fresh top page + any tail pages already loaded
        const freshTxids = new Set(verified.map((i) => i.txid));
        const tail = prev.filter((i) => !freshTxids.has(i.txid));
        return [...verified, ...tail];
      });
      setParentPosts((prev) => ({ ...prev, ...Object.fromEntries(pp.map((p) => [p.txid, p])) }));
      setParentActivities((prev) => ({ ...prev, ...Object.fromEntries(pa.map((a) => [a.txid, a])) }));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // loadMore has no state deps - uses refs for guards so it's stable and never races
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const offset = offsetRef.current;
      const { items: data, parentPosts: pp, parentActivities: pa } = await fetchFeed(PAGE_SIZE, offset, filter);
      if (data.length < PAGE_SIZE) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
      const verified = data.filter(verifyItem);
      if (verified.length > 0) {
        offsetRef.current = offset + PAGE_SIZE;
        setItems((prev) => {
          const existingTxids = new Set(prev.map((i) => i.txid));
          return [
            ...prev,
            ...verified.filter((i) => !existingTxids.has(i.txid)),
          ];
        });
        setParentPosts((prev) => ({ ...Object.fromEntries(pp.map((p) => [p.txid, p])), ...prev }));
        setParentActivities((prev) => ({ ...Object.fromEntries(pa.map((a) => [a.txid, a])), ...prev }));
      } else if (data.length === 0) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch {
      // ignore load-more errors silently
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { items, parentPosts, parentActivities, loading, loadingMore, hasMore, error, refresh, loadMore };
}
