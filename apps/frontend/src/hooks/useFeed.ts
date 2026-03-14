import { useState, useEffect, useCallback } from "react";
import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import type { Post } from "../types";
import { fetchPosts } from "../api/cache";
import { buildUnsignedPayload, buildReplyUnsignedPayload, buildRepostUnsignedPayload, buildQuoteRepostUnsignedPayload, buildV1SigningBody, KIND_TEXT_REPLY, KIND_REPOST, KIND_QUOTE_REPOST } from "../lib/ors";

const POLL_INTERVAL_MS = 5000;

function verifyPost(post: Post): boolean {
  try {
    let unsigned: Uint8Array;
    if (post.kind === KIND_TEXT_REPLY && post.parentTxid) {
      unsigned = buildReplyUnsignedPayload(post.content, post.pubkey, post.parentTxid);
    } else if (post.kind === KIND_REPOST && post.parentTxid) {
      unsigned = buildRepostUnsignedPayload(post.pubkey, post.parentTxid);
    } else if (post.kind === KIND_QUOTE_REPOST && post.parentTxid) {
      unsigned = buildQuoteRepostUnsignedPayload(post.content, post.pubkey, post.parentTxid);
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

export function useFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPosts();
      setPosts(data.filter(verifyPost));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return { posts, loading, error, refresh };
}
