import { Link } from "react-router-dom";
import { useAuthor } from "../hooks/useAuthor";
import { useTweet } from "../hooks/useTweet";
import { timeAgo } from "../utils/timeAgo";
import Avatar from "./Avatar";

const VERBS = {
  like: "liked your tweet",
  reply: "replied to your tweet",
  follow: "followed you",
};

export default function NotificationRow({ notification, unread }) {
  const actor = useAuthor(notification.actor_user_id);
  const tweet = useTweet(notification.type === "follow" ? null : notification.tweet_id);

  const target =
    notification.type === "follow"
      ? `/users/${notification.actor_user_id}`
      : `/tweets/${notification.tweet_id}`;

  return (
    <Link
      to={target}
      className={unread ? "notification-row notification-row--unread" : "notification-row"}
    >
      <Avatar user={actor ?? { display_name: "?", avatar_url: null }} size={40} />
      <div className="notification-row__body">
        <p className="notification-row__text">
          <strong>{actor ? actor.display_name : `User #${notification.actor_user_id}`}</strong>{" "}
          {VERBS[notification.type] ?? notification.type}
        </p>
        {tweet && <p className="notification-row__snippet">{tweet.content}</p>}
        <span className="notification-row__time">{timeAgo(notification.created_at)}</span>
      </div>
    </Link>
  );
}
