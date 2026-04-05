import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { CardActions } from "./CardActions";
import { RepostModal } from "./RepostModal";
import { TxDropdownMenu } from "./TxDropdownMenu";
import { formatRelativeTime } from "../lib/utils";
import { AvatarCircle } from "./AvatarCircle";
import type { ActivityItem, Profile } from "../types";

const PROPERTY_NAMES: Record<number, string> = {
  0: "name",
  1: "avatar",
  2: "bio",
  4: "bot status",
};

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
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium hover:underline">
                  {displayName}
                </span>
                {profile?.bot === true && (
                  <span className="inline-flex items-center rounded-full border border-gray-400 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700">
                    Bot
                  </span>
                )}
                <span className="text-sm text-muted-foreground font-normal">· {relativeTime}</span>
              </div>
            </Link>
          </div>
          <TxDropdownMenu txid={item.txid} network={item.network} blockHeight={item.blockHeight} />
        </div>
        {body}
        <CardActions
          txid={item.txid}
          network={item.network}
          loggedInPubkey={loggedInPubkey}
          onRefresh={onRefresh}
          replyCount={item.replyCount}
          onReplyClick={() => navigate(`/tx/${item.txid}`)}
          repostCount={item.repostCount}
          onRepostClick={() => setRepostOpen(true)}
          shareUrl={`${window.location.origin}/tx/${item.txid}`}
          shareTitle="ORS Activity"
        />
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
