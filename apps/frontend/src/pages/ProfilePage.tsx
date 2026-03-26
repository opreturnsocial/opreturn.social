import { useState, useEffect, useCallback, useRef } from "react";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { useParams, useNavigate, Link } from "react-router-dom";
import { BoxIcon, Clock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { mempoolTxUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostCard } from "../components/PostCard";
import { TxidDropdownItem } from "../components/TxidDropdownItem";
import { RepostCard } from "../components/RepostCard";
import { ActivityCard } from "../components/ActivityCard";
import {
  fetchFeed,
  fetchFollows,
  fetchFollowers,
  fetchOgLeaderboard,
} from "../api/cache";
import type { FollowRecord } from "../api/cache";
import { submitFollowFree } from "../api/facilitator";
import { MakePermanentButton } from "../components/MakePermanentButton";
import {
  buildFollowUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
} from "../lib/ors";
import { signPayload } from "../lib/signing";
import type { Post, Profile, ActivityItem, FeedItem } from "../types";
import { nip19 } from "nostr-tools";

interface ProfilePageProps {
  profiles: Record<string, Profile>;
  allPosts: Post[];
  allActivityItems?: ActivityItem[];
  loggedInPubkey?: string | null;
  followedPubkeys?: Set<string>;
  pendingFollowPubkeys?: Set<string>;
  onFollowChange?: () => void;
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
}

export function ProfilePage({
  profiles,
  allPosts,
  allActivityItems,
  loggedInPubkey,
  followedPubkeys,
  pendingFollowPubkeys,
  onFollowChange,
  noteOgLeaderboard,
}: ProfilePageProps) {
  const { pubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const posts = feedItems.flatMap((i) => (i.feedType === "post" ? [i as Post] : []));
  const profileActivity = feedItems.flatMap((i) => (i.feedType === "activity" ? [i as ActivityItem] : []));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(20);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const [followingPubkeys, setFollowingPubkeys] = useState<string[]>([]);
  const [followerPubkeys, setFollowerPubkeys] = useState<string[]>([]);
  const [pendingFollowingPubkeys, setPendingFollowingPubkeys] = useState<
    Set<string>
  >(new Set());
  const [pendingFollowerPubkeys, setPendingFollowerPubkeys] = useState<
    Set<string>
  >(new Set());
  const [followingInfo, setFollowingInfo] = useState<Map<string, FollowRecord>>(
    new Map(),
  );
  const [followerInfo, setFollowerInfo] = useState<Map<string, FollowRecord>>(
    new Map(),
  );
  const [followListModal, setFollowListModal] = useState<
    null | "following" | "followers"
  >(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [confirmFollowOpen, setConfirmFollowOpen] = useState(false);
  const [ogRank, setOgRank] = useState<number | null>(null);
  const [ogLeaderboard, setOgLeaderboard] = useState<
    { pubkey: string; rank: number; firstTimestamp: number }[]
  >([]);
  const [ogModalOpen, setOgModalOpen] = useState(false);
  const [localIsFollowing, setLocalIsFollowing] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    setLocalIsFollowing(null);
  }, [pubkey]);

  const profile = pubkey ? profiles[pubkey] : undefined;
  const displayName =
    profile?.name ?? (pubkey ? `${pubkey.slice(0, 8)}…` : "Unknown");

  const load = useCallback(async () => {
    if (!pubkey) return;
    // Reset pagination state on (re)load
    offsetRef.current = 20;
    hasMoreRef.current = true;
    setHasMore(true);
    try {
      const [data, followsData, followers, ogData] =
        await Promise.all([
          fetchFeed(20, 0, { pubkey }),
          fetchFollows(pubkey),
          fetchFollowers(pubkey),
          fetchOgLeaderboard(),
        ]);
      setFeedItems(data);
      setFollowingPubkeys([
        ...followsData.pubkeys,
        ...followsData.pendingPubkeys,
      ]);
      setPendingFollowingPubkeys(new Set(followsData.pendingPubkeys));
      setFollowingInfo(new Map(followsData.follows.map((f) => [f.pubkey, f])));
      setFollowerPubkeys([...followers.pubkeys, ...followers.pendingPubkeys]);
      setPendingFollowerPubkeys(new Set(followers.pendingPubkeys));
      setFollowerInfo(new Map(followers.follows.map((f) => [f.pubkey, f])));
      setOgLeaderboard(ogData);
      const entry = ogData.find((e) => e.pubkey === pubkey);
      setOgRank(entry?.rank ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMorePosts = useCallback(async () => {
    if (!pubkey || loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const offset = offsetRef.current;
      const data = await fetchFeed(20, offset, { pubkey });
      if (data.length < 20) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
      if (data.length > 0) {
        offsetRef.current = offset + 20;
        setFeedItems((prev) => {
          const existingTxids = new Set(prev.map((i) => i.txid));
          return [...prev, ...data.filter((i) => !existingTxids.has(i.txid))];
        });
      } else {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch {
      // ignore
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [pubkey]); // stable per pubkey - guards are ref-based

  const sentinelRef = useInfiniteScroll(loadMorePosts, loadingMore);

  async function doFollow() {
    if (!loggedInPubkey || !pubkey) return;
    const currentlyFollowing = followedPubkeys?.has(pubkey) ?? false;
    const newIsFollow = !currentlyFollowing;
    setFollowLoading(true);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildFollowUnsignedPayload(
        pubkey,
        newIsFollow,
        loggedInPubkey,
      );
      const signingPayload =
        version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, loggedInPubkey);
      const { txid } = await submitFollowFree(
        pubkey,
        newIsFollow,
        loggedInPubkey,
        sig,
        version,
      );
      setLocalIsFollowing(newIsFollow);
      onFollowChange?.();
      // Refresh local follower count
      const followers = await fetchFollowers(pubkey);
      setFollowerPubkeys([...followers.pubkeys, ...followers.pendingPubkeys]);
      setPendingFollowerPubkeys(new Set(followers.pendingPubkeys));
      setFollowerInfo(new Map(followers.follows.map((f) => [f.pubkey, f])));
      toast.success(newIsFollow ? "Followed!" : "Unfollowed!", {
        action: { label: "View on mempool", onClick: () => window.open(mempoolTxUrl(txid, "testnet4"), "_blank") },
      });
    } catch (err) {
      toast.error((err as Error).message ?? "Failed");
    } finally {
      setFollowLoading(false);
    }
  }

  function handleFollow() {
    setConfirmFollowOpen(true);
  }

  const isFollowing =
    localIsFollowing ??
    (pubkey ? (followedPubkeys?.has(pubkey) ?? false) : false);
  const canFollow = loggedInPubkey && pubkey && loggedInPubkey !== pubkey;

  const modalPubkeys =
    followListModal === "following" ? followingPubkeys : followerPubkeys;
  const modalTitle =
    followListModal === "following" ? "Following" : "Followers";

  return (
    <div>
      <div className="flex items-start gap-3 mb-6">
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={displayName}
            className="h-14 w-14 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-orange-500 flex items-center justify-center text-white text-xl font-bold">
            {(profile?.name ?? pubkey ?? "?").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-lg">{displayName}</p>
            {ogRank !== null && (
              <button
                onClick={() => setOgModalOpen(true)}
                className="inline-flex items-center rounded-full border border-orange-400 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-600 hover:bg-orange-100 transition-colors dark:bg-orange-950 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900"
              >
                OG #{ogRank}
              </button>
            )}
            {canFollow && (
              <div className="flex items-center gap-2">
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? "..." : isFollowing ? "Following" : "Follow"}
                </Button>
                {isFollowing && (
                  <MakePermanentButton
                    actionType="follow"
                    pubkey={loggedInPubkey!}
                    followPubkey={pubkey!}
                    followIsFollow={true}
                    onSuccess={() => {
                      onFollowChange?.();
                    }}
                  />
                )}
                {isFollowing && pendingFollowPubkeys?.has(pubkey!) && (
                  <span
                    title="Unconfirmed Transaction"
                    className="cursor-pointer"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
              </div>
            )}
          </div>
          {profile?.bio && (
            <p className="text-sm text-muted-foreground">{profile.bio}</p>
          )}
          {pubkey && (
            <p
              className="text-xs text-muted-foreground font-mono mt-0.5 cursor-pointer hover:text-foreground transition-colors truncate"
              title="Click to copy npub"
              onClick={() => {
                navigator.clipboard.writeText(nip19.npubEncode(pubkey));
                toast.success("npub copied!");
              }}
            >
              {nip19.npubEncode(pubkey)}
            </p>
          )}
          <div className="flex gap-4 mt-2 text-sm">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setFollowListModal("following")}
            >
              <span className="font-semibold text-foreground">
                {followingPubkeys.length}
              </span>{" "}
              following
            </button>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setFollowListModal("followers")}
            >
              <span className="font-semibold text-foreground">
                {followerPubkeys.length}
              </span>{" "}
              followers
            </button>
          </div>
        </div>
        {(() => {
          const FIELD_NAMES: Record<number, string> = {
            0: "Name",
            1: "Avatar URL",
            2: "Bio",
          };
          const profileFieldTxids = new Map<number, ActivityItem>();
          for (const item of profileActivity) {
            if (item.type === "profile_update" && item.propertyKind !== undefined) {
              const existing = profileFieldTxids.get(item.propertyKind);
              if (!existing || (item.network === "mainnet" && existing.network !== "mainnet")) {
                profileFieldTxids.set(item.propertyKind, item);
              }
            }
          }
          if (profileFieldTxids.size === 0) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {Array.from(profileFieldTxids.entries()).map(([kind, item]) => {
                  const fieldContent = [profile?.name, profile?.avatarUrl, profile?.bio][kind] ?? "";
                  return (
                    <div key={kind}>
                      <DropdownMenuLabel className="text-xs font-normal">
                        <span className="flex items-center gap-1">
                          <span className="font-medium">
                            {FIELD_NAMES[kind] ?? `Field ${kind}`}
                          </span>
                          {item.network !== "testnet4" && (
                            <span title="On-chain bitcoin transaction"><BoxIcon className="w-3 h-3 text-orange-500 shrink-0" /></span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {item.blockHeight === 0
                            ? "In Mempool"
                            : `Confirmed at block ${item.blockHeight}`}
                        </span>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <TxidDropdownItem txid={item.txid} network={item.network}>
                        {item.network === "testnet4" && loggedInPubkey === pubkey && (
                          <MakePermanentButton
                            actionType="profile"
                            pubkey={loggedInPubkey!}
                            propertyKind={kind}
                            content={fieldContent}
                            disabled={!fieldContent}
                            onSuccess={load}
                          />
                        )}
                      </TxidDropdownItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : posts.length === 0 && profileActivity.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          {loggedInPubkey && pubkey === loggedInPubkey ? (
            <>
              <p className="text-sm">You haven't posted anything yet.</p>
              <Button variant="default" onClick={() => navigate("/")}>
                Make your first post
              </Button>
            </>
          ) : (
            <p className="text-sm">No posts by this user yet.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            // postsById uses both global context and profile-specific items for parent post lookup
            const postsById: Record<string, Post> = {};
            const activityById: Record<string, ActivityItem> = {};
            for (const a of allActivityItems ?? []) activityById[a.txid] = a;
            for (const p of allPosts) postsById[p.txid] = p;
            for (const p of posts) postsById[p.txid] = p;

            type TimelineEntry =
              | { kind: "post"; post: Post; timestamp: number; txid: string }
              | {
                  kind: "activity";
                  item: ActivityItem;
                  timestamp: number;
                  txid: string;
                };

            const merged: TimelineEntry[] = [
              ...posts.map((p) => ({
                kind: "post" as const,
                post: p,
                timestamp: p.timestamp,
                txid: p.txid,
              })),
              ...profileActivity.map((a) => ({
                kind: "activity" as const,
                item: a,
                timestamp: a.timestamp,
                txid: a.txid,
              })),
            ];
            merged.sort(
              (a, b) =>
                b.timestamp - a.timestamp || a.txid.localeCompare(b.txid),
            );

            return merged.map((entry) => {
              if (entry.kind === "activity") {
                return (
                  <ActivityCard
                    key={entry.txid}
                    item={entry.item}
                    profiles={profiles}
                    loggedInPubkey={loggedInPubkey}
                    onRefresh={load}
                  />
                );
              }
              const post = entry.post;
              if (
                post.kind === KIND_REPOST ||
                post.kind === KIND_QUOTE_REPOST
              ) {
                return (
                  <RepostCard
                    key={post.txid}
                    repost={post}
                    repostProfile={profiles[post.pubkey]}
                    originalPost={
                      post.parentTxid
                        ? (postsById[post.parentTxid] ?? null)
                        : null
                    }
                    originalProfile={
                      post.parentTxid
                        ? profiles[postsById[post.parentTxid]?.pubkey ?? ""]
                        : undefined
                    }
                  />
                );
              }
              const parentPost = post.parentTxid
                ? (postsById[post.parentTxid] ?? null)
                : null;
              return (
                <PostCard
                  key={post.txid}
                  post={post}
                  profile={profiles[post.pubkey]}
                  parentPost={parentPost}
                  parentProfile={
                    parentPost ? profiles[parentPost.pubkey] : undefined
                  }
                  parentActivity={
                    post.parentTxid && !parentPost
                      ? (activityById[post.parentTxid] ?? null)
                      : null
                  }
                  replyCount={post.replyCount ?? 0}
                  repostCount={post.repostCount ?? 0}
                  loggedInPubkey={loggedInPubkey}
                  noteOgLeaderboard={noteOgLeaderboard}
                  allProfiles={profiles}
                />
              );
            });
          })()}
        </div>
      )}

      {/* Sentinel always in DOM so the observer can attach on mount */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && <Skeleton className="h-24 w-full mt-3" />}
      {!hasMore && !loadingMore && posts.length > 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">You've reached the end.</p>
      )}

      <Dialog open={ogModalOpen} onOpenChange={setOgModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>OG Leaderboard</DialogTitle>
          </DialogHeader>
          {ogLeaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nobody here yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {ogLeaderboard.map((entry) => {
                const p = profiles[entry.pubkey];
                const name = p?.name ?? `${entry.pubkey.slice(0, 8)}…`;
                return (
                  <Link
                    key={entry.pubkey}
                    to={`/profile/${entry.pubkey}`}
                    className="flex items-center gap-3 hover:bg-muted rounded-md p-2 transition-colors"
                    onClick={() => setOgModalOpen(false)}
                  >
                    <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">
                      #{entry.rank}
                    </span>
                    {p?.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={name}
                        className="h-9 w-9 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(
                          entry.firstTimestamp * 1000,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmFollowOpen} onOpenChange={setConfirmFollowOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFollowing ? "Unfollow" : "Follow"} {displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will be posted to testnet. You can make it permanent later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doFollow}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={followListModal !== null}
        onOpenChange={(open) => !open && setFollowListModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          {modalPubkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nobody here yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {modalPubkeys.map((pk) => {
                const p = profiles[pk];
                const name = p?.name ?? `${pk.slice(0, 8)}…`;
                const isPending =
                  followListModal === "followers"
                    ? pendingFollowerPubkeys.has(pk)
                    : pendingFollowingPubkeys.has(pk);
                const info =
                  followListModal === "followers"
                    ? followerInfo.get(pk)
                    : followingInfo.get(pk);
                return (
                  <div
                    key={pk}
                    className="flex items-center gap-3 hover:bg-muted rounded-md p-2 transition-colors"
                  >
                    <Link
                      to={`/profile/${pk}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                      onClick={() => setFollowListModal(null)}
                    >
                      {p?.avatarUrl ? (
                        <img
                          src={p.avatarUrl}
                          alt={name}
                          className="h-9 w-9 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium truncate">
                        {name}
                      </span>
                    </Link>
                    {isPending && (
                      <span
                        title="Unconfirmed Transaction"
                        className="cursor-pointer shrink-0"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </span>
                    )}
                    {info && !isPending && info.network !== "testnet4" && (
                      <span title="On-chain bitcoin transaction"><BoxIcon className="w-3.5 h-3.5 text-orange-500 shrink-0" /></span>
                    )}
                    {info && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            {info.blockHeight === 0
                              ? "In Mempool"
                              : `Confirmed at block ${info.blockHeight}`}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <TxidDropdownItem txid={info.txid} network={info.network}>
                            {info.network === "testnet4" &&
                              ((followListModal === "following" && loggedInPubkey === pubkey) ||
                                (followListModal === "followers" && pk === loggedInPubkey)) && (
                              <MakePermanentButton
                                actionType="follow"
                                pubkey={loggedInPubkey!}
                                followPubkey={followListModal === "following" ? pk : pubkey!}
                                followIsFollow={true}
                                onSuccess={load}
                              />
                            )}
                          </TxidDropdownItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
