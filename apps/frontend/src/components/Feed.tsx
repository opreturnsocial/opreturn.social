import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "./PostCard";
import { RepostCard } from "./RepostCard";
import { ActivityCard } from "./ActivityCard";
import {
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
  KIND_TEXT_NOTE,
} from "../lib/ors";
import type { Post, Profile, ActivityItem } from "../types";

interface FeedProps {
  posts: Post[];
  loading: boolean;
  error: string | null;
  profiles: Record<string, Profile>;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
  tab?: "global" | "following";
  followedPubkeys?: Set<string>;
  activityItems?: ActivityItem[];
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
}

function PostSkeleton() {
  return (
    <div className="w-full space-y-2 rounded-lg border p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex justify-between pt-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

export function Feed({
  posts,
  loading,
  error,
  profiles,
  loggedInPubkey,
  onRefresh,
  tab,
  followedPubkeys,
  activityItems,
  noteOgLeaderboard,
}: FeedProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">Could not connect to cache server.</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="">
        {Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  let feedPosts: Post[];
  if (tab === "following" && followedPubkeys) {
    feedPosts = posts.filter(
      (p) =>
        followedPubkeys.has(p.pubkey) &&
        (p.kind === KIND_TEXT_NOTE ||
          p.kind === KIND_REPOST ||
          p.kind === KIND_QUOTE_REPOST ||
          p.kind === KIND_TEXT_REPLY),
    );
  } else {
    feedPosts = posts.filter(
      (p) =>
        p.kind === KIND_TEXT_NOTE ||
        p.kind === KIND_REPOST ||
        p.kind === KIND_QUOTE_REPOST ||
        p.kind === KIND_TEXT_REPLY,
    );
  }

  let filteredActivity: ActivityItem[] = activityItems ?? [];
  if (tab === "following" && followedPubkeys) {
    filteredActivity = filteredActivity.filter((a) => followedPubkeys.has(a.pubkey));
  }

  if (feedPosts.length === 0 && filteredActivity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No posts yet.</p>
        <p className="text-xs mt-1">
          {tab === "following"
            ? "No posts from people you follow yet."
            : "Be the first to post on bitcoin!"}
        </p>
      </div>
    );
  }

  const replyCountMap: Record<string, number> = {};
  const repostCountMap: Record<string, number> = {};
  for (const p of posts) {
    if (p.kind === KIND_TEXT_REPLY && p.parentTxid) {
      replyCountMap[p.parentTxid] = (replyCountMap[p.parentTxid] ?? 0) + 1;
    } else if (
      (p.kind === KIND_REPOST || p.kind === KIND_QUOTE_REPOST) &&
      p.parentTxid
    ) {
      repostCountMap[p.parentTxid] = (repostCountMap[p.parentTxid] ?? 0) + 1;
    }
  }

  const postsById: Record<string, Post> = {};
  for (const p of posts) {
    postsById[p.txid] = p;
  }

  const activityById: Record<string, ActivityItem> = {};
  for (const a of filteredActivity) {
    activityById[a.txid] = a;
  }

  // Merge posts and activity items sorted by timestamp desc
  type FeedItem =
    | { kind: "post"; post: Post; timestamp: number; txid: string }
    | { kind: "activity"; item: ActivityItem; timestamp: number; txid: string };

  const merged: FeedItem[] = [
    ...feedPosts.map((p) => ({ kind: "post" as const, post: p, timestamp: p.timestamp, txid: p.txid })),
    ...filteredActivity.map((a) => ({ kind: "activity" as const, item: a, timestamp: a.timestamp, txid: a.txid })),
  ];
  merged.sort((a, b) => b.timestamp - a.timestamp || a.txid.localeCompare(b.txid));

  return (
    <div className="">
      {merged.map((entry) => {
        if (entry.kind === "activity") {
          return <ActivityCard key={entry.txid} item={entry.item} profiles={profiles} loggedInPubkey={loggedInPubkey} onRefresh={onRefresh} />;
        }
        const post = entry.post;
        if (post.kind === KIND_REPOST || post.kind === KIND_QUOTE_REPOST) {
          return (
            <RepostCard
              key={post.txid}
              repost={post}
              repostProfile={profiles[post.pubkey]}
              originalPost={
                post.parentTxid ? (postsById[post.parentTxid] ?? null) : null
              }
              originalProfile={
                post.parentTxid
                  ? profiles[postsById[post.parentTxid]?.pubkey ?? ""]
                  : undefined
              }
              loggedInPubkey={loggedInPubkey}
              onRefresh={onRefresh}
            />
          );
        }
        const parentPost = post.parentTxid ? (postsById[post.parentTxid] ?? null) : null;
        const parentActivity = !parentPost && post.parentTxid ? (activityById[post.parentTxid] ?? null) : null;
        return (
          <PostCard
            key={post.txid}
            post={post}
            profile={profiles[post.pubkey]}
            parentPost={parentPost}
            parentProfile={parentPost ? profiles[parentPost.pubkey] : undefined}
            parentActivity={parentActivity}
            replyCount={replyCountMap[post.txid] ?? 0}
            repostCount={repostCountMap[post.txid] ?? 0}
            loggedInPubkey={loggedInPubkey}
            onRefresh={onRefresh}
            noteOgLeaderboard={noteOgLeaderboard}
            allProfiles={profiles}
          />
        );
      })}
    </div>
  );
}
