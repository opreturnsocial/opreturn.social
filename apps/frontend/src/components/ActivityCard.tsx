import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, MessageCircle, MoreHorizontal, Repeat2Icon, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RepostModal } from "./RepostModal";
import { TxidDropdownItem } from "./TxidDropdownItem";
import { formatRelativeTime } from "../lib/utils";
import type { ActivityItem, Profile } from "../types";

const PROPERTY_NAMES: Record<number, string> = {
  0: "name",
  1: "avatar",
  2: "bio",
};

function AvatarCircle({ profile, pubkey }: { profile?: Profile; pubkey: string }) {
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

interface ActivityCardProps {
  item: ActivityItem;
  profiles: Record<string, Profile>;
  loggedInPubkey?: string | null;
  onRefresh?: () => void;
}

export function ActivityCard({ item, profiles, loggedInPubkey, onRefresh }: ActivityCardProps) {
  const navigate = useNavigate();
  const [repostOpen, setRepostOpen] = useState(false);
  const profile = profiles[item.pubkey];
  const displayName = profile?.name ?? `${item.pubkey.slice(0, 8)}…`;
  const relativeTime = formatRelativeTime(item.timestamp);

  let displayLabel: string;
  let body: React.ReactNode;

  if (item.type === "follow" || item.type === "unfollow") {
    const targetProfile = item.targetPubkey ? profiles[item.targetPubkey] : undefined;
    const targetName = targetProfile?.name ?? (item.targetPubkey ? `${item.targetPubkey.slice(0, 8)}…` : "unknown");
    const verb = item.type === "follow" ? "followed" : "unfollowed";
    displayLabel = `${displayName} ${verb} ${targetName}`;
    body = (
      <p className="text-sm leading-relaxed">
        <span className="text-muted-foreground">{verb} </span>
        {item.targetPubkey && (
          <Link
            to={`/profile/${item.targetPubkey}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {targetName}
          </Link>
        )}
      </p>
    );
  } else {
    const propName = item.propertyKind !== undefined ? (PROPERTY_NAMES[item.propertyKind] ?? "profile") : "profile";
    const showValue = (item.propertyKind === 0 || item.propertyKind === 2) && item.value;
    displayLabel = showValue
      ? `${displayName} updated their ${propName}: ${item.value}`
      : `${displayName} updated their ${propName}`;
    body = (
      <div className="text-sm leading-relaxed">
        <span className="text-muted-foreground">updated their {propName}</span>
        {showValue && (
          <p className="mt-1 text-foreground">
            {item.value!.length > 80 ? `${item.value!.slice(0, 80)}…` : item.value}
          </p>
        )}
        {item.propertyKind === 1 && item.value && (
          <img
            src={item.value}
            alt="new avatar"
            className="mt-1 h-10 w-10 rounded-full object-cover border border-border"
          />
        )}
      </div>
    );
  }

  return (
    <Card
      className="w-full cursor-pointer hover:bg-accent/30 transition-colors border-[1px] border-b-0"
      onClick={() => navigate(`/tx/${item.txid}`)}
    >
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${item.pubkey}`}
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <AvatarCircle profile={profile} pubkey={item.pubkey} />
              <span className="text-sm font-medium hover:underline">
                {displayName}
                <span className="text-muted-foreground font-normal"> · {relativeTime}</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {item.blockHeight === 0 && (
              <div title="Unconfirmed Transaction">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {item.blockHeight === 0 ? "In Mempool" : `Confirmed at block ${item.blockHeight}`}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <TxidDropdownItem txid={item.txid} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {body}
        <div className="mt-3 flex items-center gap-3">
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {item.replyCount > 0 && <span>{item.replyCount}</span>}
          </div>
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setRepostOpen(true); }}
          >
            <Repeat2Icon className="size-4" />
            {item.repostCount > 0 && <span>{item.repostCount}</span>}
          </div>
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation();
              const url = `${window.location.origin}/tx/${item.txid}`;
              if (navigator.share) {
                await navigator.share({ title: "ORS Activity", url });
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
        txid={item.txid}
        displayContent={displayLabel}
        loggedInPubkey={loggedInPubkey ?? null}
      />
    </Card>
  );
}
