import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  CornerUpLeft,
  MessageCircle,
  MoreHorizontal,
  Repeat2Icon,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { RepostModal } from "./RepostModal";
import { TxidDropdownItem } from "./TxidDropdownItem";
import { formatRelativeTime } from "../lib/utils";
import { KIND_TEXT_NOTE, KIND_TEXT_REPLY, KIND_QUOTE_REPOST } from "../lib/ors";
import type { Post, Profile, ActivityItem } from "../types";

type NoteOgEntry = {
  txid: string;
  rank: number;
  timestamp: number;
  pubkey: string;
  content: string;
};

interface PostCardProps {
  post: Post;
  profile?: Profile;
  parentPost?: Post | null;
  parentProfile?: Profile;
  parentActivity?: ActivityItem | null;
  hideReplyHeader?: boolean;
  replyCount?: number;
  repostCount?: number;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
  noteOgLeaderboard?: NoteOgEntry[];
  allProfiles?: Record<string, Profile>;
}

function AvatarCircle({
  profile,
  pubkey,
}: {
  profile?: Profile;
  pubkey: string;
}) {
  if (profile?.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.name ?? pubkey.slice(0, 4)}
        className="h-7 w-7 rounded-full object-cover border border-border flex-shrink-0"
      />
    );
  }
  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : pubkey.slice(0, 2).toUpperCase();
  return (
    <div className="h-7 w-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

export function PostCard({
  post,
  profile,
  parentPost,
  parentProfile,
  parentActivity,
  hideReplyHeader,
  replyCount,
  repostCount,
  loggedInPubkey,
  onRefresh,
  noteOgLeaderboard,
  allProfiles,
}: PostCardProps) {
  const navigate = useNavigate();
  const [repostOpen, setRepostOpen] = useState(false);
  const [noteLeaderboardOpen, setNoteLeaderboardOpen] = useState(false);
  const noteOgRank = noteOgLeaderboard?.find((n) => n.txid === post.txid)?.rank;
  const shortTxid = `${post.txid.slice(0, 8)}...${post.txid.slice(-8)}`;
  const displayName = profile?.name ?? `${post.pubkey.slice(0, 8)}…`;
  const relativeTime = formatRelativeTime(post.timestamp);

  return (
    <Card
      className="w-full cursor-pointer hover:bg-accent/30 transition-colors border-[1px] border-b-0"
      onClick={() => navigate(`/tx/${post.txid}`)}
    >
      <CardContent className="pt-4">
        {!hideReplyHeader && post.kind === KIND_TEXT_REPLY && post.parentTxid && (
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/tx/${post.parentTxid}`);
            }}
          >
            <CornerUpLeft className="h-3 w-3 shrink-0" />
            {parentPost ? (
              <span className="flex items-center gap-1 truncate">
                {parentProfile?.avatarUrl ? (
                  <img
                    src={parentProfile.avatarUrl}
                    alt={parentProfile.name ?? parentPost.pubkey.slice(0, 4)}
                    className="h-4 w-4 rounded-full object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="h-4 w-4 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0" style={{ fontSize: "8px", fontWeight: "bold" }}>
                    {(parentProfile?.name ?? parentPost.pubkey).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="font-medium">
                  {parentProfile?.name ?? `${parentPost.pubkey.slice(0, 8)}…`}
                </span>
                {": "}
                <span className="italic">
                  {parentPost.content.length > 60
                    ? parentPost.content.slice(0, 60) + "…"
                    : parentPost.content}
                </span>
              </span>
            ) : parentActivity ? (
              (() => {
                const actProfile = allProfiles?.[parentActivity.pubkey];
                const actName = actProfile?.name ?? `${parentActivity.pubkey.slice(0, 8)}…`;
                return (
                  <span className="flex items-center gap-1 truncate">
                    {actProfile?.avatarUrl ? (
                      <img
                        src={actProfile.avatarUrl}
                        alt={actName}
                        className="h-4 w-4 rounded-full object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0" style={{ fontSize: "8px", fontWeight: "bold" }}>
                        {actName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium">{actName}</span>
                  </span>
                );
              })()
            ) : (
              <span>
                Replied to{" "}
                <span className="font-mono hover:underline">
                  {post.parentTxid.slice(0, 8)}...{post.parentTxid.slice(-8)}
                </span>
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <div
            className="flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/profile/${post.pubkey}`);
            }}
          >
            <AvatarCircle profile={profile} pubkey={post.pubkey} />
            <span className="text-sm font-medium hover:underline cursor-pointer">
              {displayName}
              <span className="text-muted-foreground font-normal no-underline">
                {" "}
                · {relativeTime}
              </span>
            </span>
          </div>
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {post.blockHeight === 0 && (
              <div title="Unconfirmed Transaction">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {post.blockHeight === 0
                    ? "In Mempool"
                    : `Confirmed at block ${post.blockHeight}`}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <TxidDropdownItem txid={post.txid} shortTxid={shortTxid} />
                {noteOgRank !== undefined && post.kind === KIND_TEXT_NOTE && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-muted-foreground"
                      onClick={() => setNoteLeaderboardOpen(true)}
                    >
                      Note #{noteOgRank}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {post.content}
        </p>
        {post.kind === KIND_QUOTE_REPOST && (
          parentPost ? (
            <div
              className="mt-3 rounded-md border p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/tx/${parentPost.txid}`);
              }}
            >
              <div
                className="flex items-center gap-2 mb-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/profile/${parentPost.pubkey}`);
                }}
              >
                <span className="text-sm font-medium hover:underline cursor-pointer">
                  {parentProfile?.name ?? `${parentPost.pubkey.slice(0, 8)}…`}
                </span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
                {parentPost.content}
              </p>
            </div>
          ) : post.parentTxid ? (
            <div className="mt-3 rounded-md border p-3 bg-muted/30 text-xs text-muted-foreground">
              Original post not available
            </div>
          ) : null
        )}
        <div className="mt-3 flex items-center gap-3">
          {replyCount !== undefined && (
            <div
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/tx/${post.txid}`);
              }}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{replyCount}</span>
            </div>
          )}
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setRepostOpen(true);
            }}
          >
            <Repeat2Icon className="size-4" />
            {repostCount !== undefined && <span>{repostCount}</span>}
          </div>
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation();
              const url = `${window.location.origin}/tx/${post.txid}`;
              if (navigator.share) {
                await navigator.share({ title: "ORS Note", url });
              } else {
                await navigator.clipboard.writeText(url);
                toast.success("Link copied!");
              }
            }}
          >
            <Share2 className="h-3.5 w-3.5" />
          </div>
        </div>
      </CardContent>
      <RepostModal
        open={repostOpen}
        onOpenChange={setRepostOpen}
        onReposted={() => onRefresh?.()}
        txid={post.txid}
        displayContent={post.content}
        loggedInPubkey={loggedInPubkey ?? null}
      />
      <Dialog open={noteLeaderboardOpen} onOpenChange={setNoteLeaderboardOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>OG Notes</DialogTitle>
          </DialogHeader>
          {!noteOgLeaderboard || noteOgLeaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No confirmed notes yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {noteOgLeaderboard.map((entry) => {
                const p = allProfiles?.[entry.pubkey];
                const name = p?.name ?? `${entry.pubkey.slice(0, 8)}…`;
                return (
                  <Link
                    key={entry.txid}
                    to={`/tx/${entry.txid}`}
                    className="flex items-center gap-3 hover:bg-muted rounded-md p-2 transition-colors"
                    onClick={() => setNoteLeaderboardOpen(false)}
                  >
                    <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">
                      #{entry.rank}
                    </span>
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.content}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
