import { Link } from "react-router-dom";
import { useAuthor } from "../hooks/useAuthor";
import { useLikeToggle } from "../hooks/useLikeToggle";
import { timeAgo } from "../utils/timeAgo";
import Avatar from "./Avatar";

export default function ReplyRow({ tweet, likedByMe = false, showParentLink = false }) {
  const author = useAuthor(tweet.user_id);
  const { liked, likeCount, pending, toggleLike } = useLikeToggle(tweet, likedByMe);

  return (
    <div className="reply-row">
      {showParentLink && tweet.parent_tweet_id && (
        <Link to={`/tweets/${tweet.parent_tweet_id}`} className="reply-row__parent-link">
          View original post
        </Link>
      )}
      <div className="reply-row__layout">
        <Link to={`/users/${tweet.user_id}`} className="reply-row__avatar-link">
          <Avatar user={author ?? { display_name: "?", avatar_url: null }} size={32} />
        </Link>
        <div className="reply-row__body">
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
      </div>
    </div>
  );
}
