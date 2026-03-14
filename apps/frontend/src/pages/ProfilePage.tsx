import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Clock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useNetworkStats } from "../hooks/useNetworkStats";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostCard } from "../components/PostCard";
import { RepostCard } from "../components/RepostCard";
import {
  fetchPosts,
  fetchFollows,
  fetchFollowers,
  fetchOgLeaderboard,
} from "../api/cache";
import type { FollowRecord } from "../api/cache";
import { submitFollow } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import {
  buildFollowUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  estimatedVBytes,
  KIND_TEXT_REPLY,
  KIND_REPOST,
  KIND_QUOTE_REPOST,
} from "../lib/ors";
import { getFeeBumpSatPerVByte } from "../lib/fees";
import { signPayload } from "../lib/signing";
import type { Post, Profile } from "../types";
import { nip19 } from "nostr-tools";

interface ProfilePageProps {
  profiles: Record<string, Profile>;
  allPosts: Post[];
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
  loggedInPubkey,
  followedPubkeys,
  pendingFollowPubkeys,
  onFollowChange,
  noteOgLeaderboard,
}: ProfilePageProps) {
  const { pubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { feeRate, btcPriceUsd } = useNetworkStats();
  const [ogRank, setOgRank] = useState<number | null>(null);
  const [ogLeaderboard, setOgLeaderboard] = useState<
    { pubkey: string; rank: number; firstTimestamp: number }[]
  >([]);
  const [ogModalOpen, setOgModalOpen] = useState(false);

  const profile = pubkey ? profiles[pubkey] : undefined;
  const displayName =
    profile?.name ?? (pubkey ? `${pubkey.slice(0, 8)}…` : "Unknown");

  const load = useCallback(async () => {
    if (!pubkey) return;
    try {
      const [data, followsData, followers, ogData] = await Promise.all([
        fetchPosts(50, 0, pubkey),
        fetchFollows(pubkey),
        fetchFollowers(pubkey),
        fetchOgLeaderboard(),
      ]);
      setPosts(data);
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

  async function doFollow() {
    if (!loggedInPubkey || !pubkey) return;
    const currentlyFollowing = followedPubkeys?.has(pubkey) ?? false;
    const newIsFollow = !currentlyFollowing;
    setFollowLoading(true);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildFollowUnsignedPayload(pubkey, newIsFollow, loggedInPubkey);
      const signingPayload = version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, loggedInPubkey);
      const { invoice, paymentHash } = await submitFollow(pubkey, newIsFollow, loggedInPubkey, sig, version);
      await payAndBroadcast(invoice, paymentHash);
      onFollowChange?.();
      // Refresh local follower count
      const followers = await fetchFollowers(pubkey);
      setFollowerPubkeys([...followers.pubkeys, ...followers.pendingPubkeys]);
      setPendingFollowerPubkeys(new Set(followers.pendingPubkeys));
      setFollowerInfo(new Map(followers.follows.map((f) => [f.pubkey, f])));
      toast.success(newIsFollow ? "Followed!" : "Unfollowed!");
    } catch (err) {
      toast.error((err as Error).message ?? "Failed");
    } finally {
      setFollowLoading(false);
    }
  }

  function handleFollow() {
    setConfirmFollowOpen(true);
  }

  const isFollowing = pubkey ? (followedPubkeys?.has(pubkey) ?? false) : false;
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
                {isFollowing && pendingFollowPubkeys?.has(pubkey!) && (
                  <span title="Unconfirmed Transaction" className="cursor-help">
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
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : posts.length === 0 ? (
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
            const replyCountMap: Record<string, number> = {};
            const repostCountMap: Record<string, number> = {};
            const postsById: Record<string, Post> = {};
            for (const p of allPosts) {
              postsById[p.txid] = p;
              if (p.kind === KIND_TEXT_REPLY && p.parentTxid)
                replyCountMap[p.parentTxid] =
                  (replyCountMap[p.parentTxid] ?? 0) + 1;
              else if (
                (p.kind === KIND_REPOST || p.kind === KIND_QUOTE_REPOST) &&
                p.parentTxid
              )
                repostCountMap[p.parentTxid] =
                  (repostCountMap[p.parentTxid] ?? 0) + 1;
            }
            return posts.map((post) => {
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
              return (
                <PostCard
                  key={post.txid}
                  post={post}
                  profile={profiles[post.pubkey]}
                  parentPost={
                    post.parentTxid
                      ? (postsById[post.parentTxid] ?? null)
                      : null
                  }
                  parentProfile={
                    post.parentTxid
                      ? profiles[postsById[post.parentTxid]?.pubkey ?? ""]
                      : undefined
                  }
                  replyCount={replyCountMap[post.txid] ?? 0}
                  repostCount={repostCountMap[post.txid] ?? 0}
                  noteOgLeaderboard={noteOgLeaderboard}
                  allProfiles={profiles}
                />
              );
            });
          })()}
        </div>
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
              This will be recorded on-chain.
              {feeRate !== null &&
                (() => {
                  const effectiveFeeRate = feeRate + getFeeBumpSatPerVByte();
                  // kindData for FOLLOW = targetPubkey(32) + action(1) = 33 bytes
                  const sats = Math.ceil(estimatedVBytes(33, getProtocolVersion()) * effectiveFeeRate);
                  const usd =
                    btcPriceUsd !== null
                      ? ((sats * btcPriceUsd) / 1e8).toFixed(2)
                      : null;
                  return ` Estimated cost: ~${sats} sats${usd !== null ? ` ($${usd})` : ""}.`;
                })()}
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
                const shortTxid = info
                  ? `${info.txid.slice(0, 8)}...${info.txid.slice(-8)}`
                  : null;
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
                        className="cursor-help shrink-0"
                      >
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      </span>
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
                          <DropdownMenuItem
                            className="font-mono text-xs"
                            onClick={() =>
                              navigator.clipboard.writeText(info.txid)
                            }
                          >
                            <span className="text-muted-foreground mr-2">
                              TXID
                            </span>
                            {shortTxid}
                            <Badge
                              variant="secondary"
                              className="ml-auto text-xs"
                            >
                              Copy
                            </Badge>
                          </DropdownMenuItem>
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
