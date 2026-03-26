import { BoxIcon, MessageCircle, Repeat2Icon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { SponsorButton } from "./SponsorButton";

interface CardActionsProps {
  txid: string;
  network?: string;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
  replyCount?: number;
  onReplyClick?: () => void;
  repostCount?: number;
  onRepostClick?: () => void;
  shareUrl?: string;
  shareTitle?: string;
}

export function CardActions({
  txid,
  network,
  loggedInPubkey,
  onRefresh,
  replyCount,
  onReplyClick,
  repostCount,
  onRepostClick,
  shareUrl,
  shareTitle,
}: CardActionsProps) {
  return (
    <div className="mt-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
      {onReplyClick !== undefined && (
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={onReplyClick}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {replyCount !== undefined && <span>{replyCount}</span>}
        </div>
      )}
      {onRepostClick !== undefined && (
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={onRepostClick}
        >
          <Repeat2Icon className="size-4" />
          {repostCount !== undefined && <span>{repostCount}</span>}
        </div>
      )}
      {shareUrl !== undefined && (
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          onClick={async () => {
            if (navigator.share) {
              await navigator.share({ title: shareTitle ?? "ORS", url: shareUrl });
            } else {
              await navigator.clipboard.writeText(shareUrl);
              toast.success("Link copied!");
            }
          }}
        >
          <Share2 className="h-3.5 w-3.5" />
        </div>
      )}
      {network === "testnet4" && loggedInPubkey && (
        <SponsorButton
          testnetTxid={txid}
          loggedInPubkey={loggedInPubkey}
          onSuccess={() => onRefresh?.()}
        />
      )}
      {network !== "testnet4" && (
        <span title="On-chain bitcoin transaction">
          <BoxIcon className="h-3.5 w-3.5 text-orange-500" />
        </span>
      )}
    </div>
  );
}
