import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "./PostCard";
import { RepostCard } from "./RepostCard";
import { ActivityCard } from "./ActivityCard";
import {
  KIND_REPOST,
  KIND_QUOTE_REPOST,
} from "../lib/ors";
import type { Post, Profile, ActivityItem, FeedItem } from "../types";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";

interface FeedProps {
  items: FeedItem[];
  parentPosts?: Record<string, Post>;
  parentActivities?: Record<string, ActivityItem>;
  loading: boolean;
  error: string | null;
  profiles: Record<string, Profile>;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
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
  items,
  parentPosts,
  parentActivities,
  loading,
  error,
  profiles,
  loggedInPubkey,
  onRefresh,
  noteOgLeaderboard,
  onLoadMore,
  loadingMore,
  hasMore,
}: FeedProps) {
  // Sentinel must always be in the DOM so the observer can attach on mount
  const sentinelRef = useInfiniteScroll(onLoadMore, loadingMore);

  let content: React.ReactNode;

  if (error) {
    content = (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">Could not connect to cache server.</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  } else if (loading) {
    content = (
      <div className="">
        {Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No posts yet.</p>
        <p className="text-xs mt-1">Be the first to post on bitcoin!</p>
      </div>
    );
  } else {
    const postsById: Record<string, Post> = { ...(parentPosts ?? {}) };
    const activityById: Record<string, ActivityItem> = { ...(parentActivities ?? {}) };
    for (const item of items) {
      if (item.feedType === "post") postsById[item.txid] = item;
      else activityById[item.txid] = item;
    }

    content = (
      <div className="">
        {items.map((item) => {
          if (item.feedType === "activity") {
            return (
              <ActivityCard
                key={item.txid}
                item={item}
                profiles={profiles}
                loggedInPubkey={loggedInPubkey}
                onRefresh={onRefresh}
              />
            );
          }
          const post = item;
          if (post.kind === KIND_REPOST || post.kind === KIND_QUOTE_REPOST) {
            return (
              <RepostCard
                key={post.txid}
                repost={post}
                repostProfile={profiles[post.pubkey]}
                originalPost={post.parentTxid ? (postsById[post.parentTxid] ?? null) : null}
                originalProfile={post.parentTxid ? profiles[postsById[post.parentTxid]?.pubkey ?? ""] : undefined}
                loggedInPubkey={loggedInPubkey}
                onRefresh={onRefresh}
                replyCount={post.replyCount ?? 0}
                repostCount={post.repostCount ?? 0}
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
              replyCount={post.replyCount ?? 0}
              repostCount={post.repostCount ?? 0}
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

  return (
    <div>
      {content}
      {/* Sentinel is always rendered so the observer can attach on mount */}
      {onLoadMore && (
        <>
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && <PostSkeleton />}
          {!hasMore && !loadingMore && (
            <p className="text-center text-xs text-muted-foreground py-6">You've reached the end.</p>
          )}
        </>
      )}
    </div>
  );
}
