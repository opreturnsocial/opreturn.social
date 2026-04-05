import { useState, useEffect, useCallback, useRef } from "react";
import { fetchNotificationUnreadCount, fetchNotifications } from "../api/cache";
import type { Notification } from "../types";

const LAST_READ_KEY = "ors_notifications_last_read";
const POLL_INTERVAL_MS = 30_000;

export function useNotifications(loggedInPubkey: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);

  function getLastRead(): number {
    return Number(localStorage.getItem(LAST_READ_KEY) ?? "0");
  }

  function markAllRead() {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(LAST_READ_KEY, String(now));
    setUnreadCount(0);
  }

  const refreshUnreadCount = useCallback(async () => {
    if (!loggedInPubkey) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await fetchNotificationUnreadCount(loggedInPubkey, getLastRead());
      setUnreadCount(count);
    } catch {
      // silently ignore
    }
  }, [loggedInPubkey]);

  const loadNotifications = useCallback(async () => {
    if (!loggedInPubkey || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { notifications: items, hasMore: more } = await fetchNotifications(loggedInPubkey, 20);
      notificationsRef.current = items;
      setNotifications(items);
      hasMoreRef.current = more;
      setHasMore(more);
    } catch {
      // silently ignore
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [loggedInPubkey]);

  const loadMore = useCallback(async () => {
    if (!loggedInPubkey || loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    try {
      const items = notificationsRef.current;
      const lastId = items[items.length - 1]?.id;
      const { notifications: more, hasMore: moreAvail } = await fetchNotifications(
        loggedInPubkey,
        20,
        lastId,
      );
      const existingIds = new Set(items.map((n) => n.id));
      const appended = [...items, ...more.filter((n) => !existingIds.has(n.id))];
      notificationsRef.current = appended;
      setNotifications(appended);
      hasMoreRef.current = moreAvail;
      setHasMore(moreAvail);
    } catch {
      // silently ignore
    } finally {
      loadingRef.current = false;
    }
  }, [loggedInPubkey]);

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  return {
    unreadCount,
    notifications,
    loading,
    hasMore,
    markAllRead,
    loadNotifications,
    loadMore,
  };
}
