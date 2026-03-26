import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Repeat2 } from "lucide-react";
import { KIND_QUOTE_REPOST } from "../lib/ors";
import { formatRelativeTime } from "../lib/utils";
import { CardActions } from "./CardActions";
import { RepostModal } from "./RepostModal";
import type { Post, Profile } from "../types";

interface RepostCardProps {
  repost: Post;
  repostProfile?: Profile;
  originalPost: Post | null;
  originalProfile?: Profile;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
  replyCount?: number;
  repostCount?: number;
}

export function RepostCard({
  repost,
  repostProfile,
  originalPost,
  originalProfile,
  loggedInPubkey,
  onRefresh,
  replyCount,
  repostCount,
}: RepostCardProps) {
  const navigate = useNavigate();
  const [repostOpen, setRepostOpen] = useState(false);

  const repostDisplayName =
    repostProfile?.name ?? `${repost.pubkey.slice(0, 8)}…`;
  const originalDisplayName = originalPost
    ? (originalProfile?.name ?? `${originalPost.pubkey.slice(0, 8)}…`)
    : null;

  return (
    <Card
      className="w-full cursor-pointer hover:bg-accent/30 transition-colors border-[1px] border-b-0"
      onClick={() => {
        if (repost.kind === KIND_QUOTE_REPOST) {
          navigate(`/tx/${repost.txid}`);
        } else if (originalPost) {
          navigate(`/tx/${originalPost.txid}`);
        }
      }}
    >
      <CardContent className="pt-4">
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/profile/${repost.pubkey}`);
          }}
        >
          <Repeat2 className="h-3.5 w-3.5" />
          <span className="hover:underline cursor-pointer">
            {repostDisplayName} reposted
          </span>
          <span>· {formatRelativeTime(repost.timestamp)}</span>
        </div>

        {repost.kind === KIND_QUOTE_REPOST && repost.content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-3">
            {repost.content}
          </p>
        )}

        {originalPost ? (
          <div
            className="rounded-md border p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/tx/${originalPost.txid}`);
            }}
          >
            <div
              className="flex items-center gap-2 mb-1.5"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/profile/${originalPost.pubkey}`);
              }}
            >
              <span className="text-sm font-medium hover:underline cursor-pointer">
                {originalDisplayName}
              </span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
              {originalPost.content}
            </p>
          </div>
        ) : (
          <div className="rounded-md border p-3 bg-muted/30 text-xs text-muted-foreground">
            Original post not available
          </div>
        )}
        <CardActions
          txid={repost.txid}
          network={repost.network}
          loggedInPubkey={loggedInPubkey}
          onRefresh={onRefresh}
          replyCount={replyCount}
          onReplyClick={() => navigate(`/tx/${repost.txid}`)}
          repostCount={repostCount}
          onRepostClick={() => setRepostOpen(true)}
          shareUrl={`${window.location.origin}/tx/${repost.txid}`}
          shareTitle="ORS Repost"
        />
      </CardContent>
      <RepostModal
        open={repostOpen}
        onOpenChange={setRepostOpen}
        onReposted={() => onRefresh?.()}
        txid={repost.txid}
        displayContent={repost.content || originalPost?.content || ""}
        loggedInPubkey={loggedInPubkey ?? null}
      />
    </Card>
  );
}
