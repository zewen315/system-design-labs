import { useCallback, useEffect, useRef, useState } from "react";
import { getNotifications, getUnreadNotificationCount, markNotificationsRead } from "../api/client";
import { useUser } from "../context/UserContext";
import NotificationRow from "../components/NotificationRow";
import EmptyState from "../components/EmptyState";

const PAGE_SIZE = 20;

export default function Notifications() {
  const { currentUser } = useUser();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const markedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unread, page] = await Promise.all([
        getUnreadNotificationCount(currentUser.id),
        getNotifications(currentUser.id, { limit: PAGE_SIZE, offset: 0 }),
      ]);

      setNotifications(page);
      setOffset(page.length);
      setHasMore(page.length === PAGE_SIZE);
      // Freeze how many rows render as unread at the moment this page
      // loaded — marking read below would otherwise flip every row to
      // read out from under the user while they're still looking at it.
      setUnreadCount(unread.unread_count);

      if (!markedRef.current) {
        markedRef.current = true;
        if (page.length > 0) {
          await markNotificationsRead(currentUser.id, page[0].created_at);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await getNotifications(currentUser.id, { limit: PAGE_SIZE, offset });
      setNotifications((prev) => [...prev, ...page]);
      setOffset((prev) => prev + page.length);
      setHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <div className="page">
      <h2>Notifications</h2>

      <div className="notification-list">
        {notifications.map((n, i) => (
          <NotificationRow
            key={`${n.type}-${n.actor_user_id}-${n.tweet_id ?? "f"}-${n.created_at}`}
            notification={n}
            unread={i < unreadCount}
          />
        ))}
        {!loading && notifications.length === 0 && <EmptyState message="No notifications yet." />}
      </div>

      {hasMore && notifications.length > 0 && (
        <button
          type="button"
          className="tweet-card__load-more"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
      {!hasMore && !loading && notifications.length > 0 && (
        <p className="end-of-list">No more notifications.</p>
      )}
    </div>
  );
}
