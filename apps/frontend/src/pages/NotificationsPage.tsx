import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  CornerDownLeftIcon,
  Repeat2Icon,
  QuoteIcon,
  UserPlusIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import { formatRelativeTime } from "../lib/utils";
import { AvatarCircle } from "../components/AvatarCircle";
import { KIND_TEXT_REPLY, KIND_REPOST, KIND_QUOTE_REPOST, KIND_FOLLOW } from "../lib/ors";
import type { Notification, Profile } from "../types";

interface NotificationsPageProps {
  loggedInPubkey: string | null;
  profiles: Record<string, Profile>;
  notifications: Notification[];
  loading: boolean;
  hasMore: boolean;
  onMount: () => void;
  onLoadMore: () => void;
}

function NotificationRow({
  n,
  profiles,
}: {
  n: Notification;
  profiles: Record<string, Profile>;
}) {
  const actor = profiles[n.actorPubkey];
  const actorName = actor?.name ?? `${n.actorPubkey.slice(0, 8)}\u2026`;

  let icon: React.ReactNode;
  let label: React.ReactNode;

  switch (n.kind) {
    case KIND_TEXT_REPLY:
      icon = <CornerDownLeftIcon className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />;
      label = (
        <>
          <strong>{actorName}</strong> replied to your post
        </>
      );
      break;
    case KIND_REPOST:
      icon = <Repeat2Icon className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />;
      label = (
        <>
          <strong>{actorName}</strong> reposted your post
        </>
      );
      break;
    case KIND_QUOTE_REPOST:
      icon = <QuoteIcon className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />;
      label = (
        <>
          <strong>{actorName}</strong> quote-reposted your post
        </>
      );
      break;
    case KIND_FOLLOW:
      icon = <UserPlusIcon className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />;
      label = (
        <>
          <strong>{actorName}</strong> followed you
        </>
      );
      break;
    default:
      return null;
  }

  const href = n.kind === 6 ? `/profile/${n.actorPubkey}` : `/tx/${n.txid}`;

  return (
    <Link
      to={href}
      className="flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-b-0 no-underline"
    >
      <AvatarCircle profile={actor} pubkey={n.actorPubkey} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {icon}
          <p className="text-sm">{label}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(n.timestamp)}
        </p>
      </div>
    </Link>
  );
}

export function NotificationsPage({
  loggedInPubkey,
  profiles,
  notifications,
  loading,
  hasMore,
  onMount,
  onLoadMore,
}: NotificationsPageProps) {
  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentinelRef = useInfiniteScroll(hasMore ? onLoadMore : undefined, loading);

  if (!loggedInPubkey) {
    return (
      <p className="text-center text-muted-foreground py-12">
        Log in to see notifications.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Notifications</h1>
      {loading && notifications.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && notifications.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          No notifications yet.
        </p>
      )}
      {notifications.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {notifications.map((n) => (
            <NotificationRow key={`${n.txid}-${n.network}`} n={n} profiles={profiles} />
          ))}
        </div>
      )}
      <div ref={sentinelRef} className="h-8" />
    </div>
  );
}
