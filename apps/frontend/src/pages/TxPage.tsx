import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { sha256 } from "@noble/hashes/sha256";
import { schnorr } from "@noble/curves/secp256k1";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PostCard } from "../components/PostCard";
import { ActivityCard } from "../components/ActivityCard";
import { fetchPost, fetchActivityItem, fetchReplies } from "../api/cache";
import { submitReply } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import { useNetworkStats } from "../hooks/useNetworkStats";
import { signPayload } from "../lib/signing";
import {
  buildReplyUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  estimatedVBytes,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  MAX_CONTENT_BYTES,
} from "../lib/ors";
import { getFeeBumpSatPerVByte } from "../lib/fees";
import type { Post, Profile, ActivityItem } from "../types";

const POLL_INTERVAL_MS = 5000;

interface TxPageProps {
  profiles: Record<string, Profile>;
  loggedInPubkey: string | null;
  allPosts: Post[];
  allActivityItems?: ActivityItem[];
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
}

export function TxPage({
  profiles,
  loggedInPubkey,
  allPosts,
  allActivityItems,
  noteOgLeaderboard,
}: TxPageProps) {
  const { txid } = useParams<{ txid: string }>();
  const navigate = useNavigate();
  const { feeRate, btcPriceUsd } = useNetworkStats();
  const [post, setPost] = useState<Post | null>(null);
  const [activity, setActivity] = useState<ActivityItem | null>(null);
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!txid) return;
    try {
      const [postRes, activityRes, repliesRes] = await Promise.allSettled([
        fetchPost(txid),
        fetchActivityItem(txid),
        fetchReplies(txid),
      ]);
      if (postRes.status === "fulfilled") setPost(postRes.value);
      else if (activityRes.status === "fulfilled")
        setActivity(activityRes.value);
      if (repliesRes.status === "fulfilled") setReplies(repliesRes.value);
    } catch {
      // ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [txid]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handleReply() {
    if (!txid || !loggedInPubkey || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildReplyUnsignedPayload(
        replyText.trim(),
        loggedInPubkey,
        txid,
      );
      const signingPayload =
        version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const msgHash = sha256(signingPayload);
      const sig = await signPayload(signingPayload, loggedInPubkey);

      if (!schnorr.verify(sig, msgHash, loggedInPubkey)) {
        toast.error("Signature verification failed");
        return;
      }

      const { invoice, paymentHash } = await submitReply(
        replyText.trim(),
        loggedInPubkey,
        sig,
        txid,
        version,
      );
      await payAndBroadcast(invoice, paymentHash);
      setReplyText("");
      toast.success("Reply submitted!", {
        description: `TXID: ${txid}`,
      });
      await load();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to submit reply");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!post && !activity) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">Not found.</p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => navigate("/")}
        >
          Back to home
        </Button>
      </div>
    );
  }

  const replyCountMap: Record<string, number> = {};
  const repostCountMap: Record<string, number> = {};
  for (const p of allPosts) {
    if (p.kind === KIND_TEXT_REPLY && p.parentTxid)
      replyCountMap[p.parentTxid] = (replyCountMap[p.parentTxid] ?? 0) + 1;
    else if (
      (p.kind === KIND_REPOST || p.kind === KIND_QUOTE_REPOST) &&
      p.parentTxid
    )
      repostCountMap[p.parentTxid] = (repostCountMap[p.parentTxid] ?? 0) + 1;
  }

  const postsById: Record<string, Post> = {};
  for (const p of allPosts) postsById[p.txid] = p;

  const activityById: Record<string, ActivityItem> = {};
  for (const a of allActivityItems ?? []) activityById[a.txid] = a;

  const canReply = !!loggedInPubkey;
  const remaining =
    MAX_CONTENT_BYTES - new TextEncoder().encode(replyText).length;

  return (
    <div>
      {post && (
        <PostCard
          post={post}
          profile={profiles[post.pubkey]}
          parentPost={
            post.parentTxid ? (postsById[post.parentTxid] ?? null) : null
          }
          parentProfile={
            post.parentTxid
              ? profiles[postsById[post.parentTxid]?.pubkey ?? ""]
              : undefined
          }
          parentActivity={
            post.parentTxid && !postsById[post.parentTxid]
              ? (activityById[post.parentTxid] ?? null)
              : null
          }
          replyCount={replies.length}
          repostCount={repostCountMap[post.txid] ?? 0}
          loggedInPubkey={loggedInPubkey}
          onRefresh={load}
          noteOgLeaderboard={noteOgLeaderboard}
          allProfiles={profiles}
        />
      )}
      {activity && (
        <ActivityCard
          item={activity}
          profiles={profiles}
          loggedInPubkey={loggedInPubkey}
          onRefresh={load}
        />
      )}

      <div className="mt-4">
        {canReply ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Write a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center justify-end gap-3">
              {remaining < 100 && (
                <span
                  className={`text-xs ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {remaining} chars remaining
                </span>
              )}
              {feeRate !== null &&
                replyText.trim() &&
                (() => {
                  const contentBytes = new TextEncoder().encode(
                    replyText,
                  ).length;
                  const version = getProtocolVersion();
                  const vBytes = estimatedVBytes(32 + contentBytes, version);
                  const effectiveFeeRate = feeRate + getFeeBumpSatPerVByte();
                  const sats = Math.ceil(vBytes * effectiveFeeRate);
                  const usd =
                    btcPriceUsd !== null
                      ? ((sats * btcPriceUsd) / 1e8).toFixed(2)
                      : null;
                  return (
                    <span className="text-xs text-muted-foreground font-mono">
                      ~{sats} sats{usd !== null && ` ($${usd})`}
                    </span>
                  );
                })()}
              <Button
                size="sm"
                onClick={handleReply}
                disabled={submitting || !replyText.trim() || remaining < 0}
              >
                {submitting ? "Submitting..." : "Reply"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Log in to reply.</p>
        )}
      </div>

      {replies.length > 0 && (
        <>
          <Separator className="mt-4 mb-2" />
          <div className="space-y-3">
            {replies.map((r) => (
              <PostCard
                key={r.txid}
                post={r}
                profile={profiles[r.pubkey]}
                hideReplyHeader
                replyCount={replyCountMap[r.txid] ?? 0}
                loggedInPubkey={loggedInPubkey}
                onRefresh={load}
                noteOgLeaderboard={noteOgLeaderboard}
                allProfiles={profiles}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
