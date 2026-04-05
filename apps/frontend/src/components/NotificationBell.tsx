import { BellIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface NotificationBellProps {
  unreadCount: number;
}

export function NotificationBell({ unreadCount }: NotificationBellProps) {
  return (
    <Link
      to="/notifications"
      className="relative h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
      title="Notifications"
    >
      <BellIcon className="h-4 w-4 text-muted-foreground" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
