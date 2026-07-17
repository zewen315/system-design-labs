import { Link } from "react-router-dom";
import { useAuthor } from "../hooks/useAuthor";
import { useLikeToggle } from "../hooks/useLikeToggle";
import { timeAgo } from "../utils/timeAgo";

export default function ReplyRow({ tweet }) {
  const author = useAuthor(tweet.user_id);
  const { liked, likeCount, pending, toggleLike } = useLikeToggle(tweet);

  return (
    <div className="reply-row">
      <div className="reply-row__header">
        <Link to={`/users/${tweet.user_id}`} className="reply-row__author">
          <strong>{author ? author.display_name : `User #${tweet.user_id}`}</strong>
          <span>@{author ? author.username : tweet.user_id}</span>
        </Link>
        <span className="reply-row__time">{timeAgo(tweet.created_at)}</span>
      </div>
      <p className="reply-row__content">{tweet.content}</p>
      <button type="button" className={liked ? "liked" : ""} onClick={toggleLike} disabled={pending}>
        {liked ? "♥" : "♡"} {likeCount}
      </button>
    </div>
  );
}
