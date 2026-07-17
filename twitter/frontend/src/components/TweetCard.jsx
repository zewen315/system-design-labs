import { Link, useNavigate } from "react-router-dom";
import { useAuthor } from "../hooks/useAuthor";
import { useLikeToggle } from "../hooks/useLikeToggle";
import { timeAgo } from "../utils/timeAgo";
import Avatar from "./Avatar";

export default function TweetCard({ tweet, clickable = true, large = false, likedByMe = false }) {
  const author = useAuthor(tweet.user_id);
  const navigate = useNavigate();
  const { liked, likeCount, pending, toggleLike } = useLikeToggle(tweet, likedByMe);

  function handleCardClick() {
    if (clickable) navigate(`/tweets/${tweet.id}`);
  }

  return (
    <article
      className={clickable ? "tweet-card tweet-card--clickable" : "tweet-card"}
      onClick={handleCardClick}
    >
      <div className="tweet-card__layout">
        <Link
          to={`/users/${tweet.user_id}`}
          onClick={(e) => e.stopPropagation()}
          className="tweet-card__avatar-link"
        >
          <Avatar user={author ?? { display_name: "?", avatar_url: null }} size={40} />
        </Link>

        <div className="tweet-card__body">
          <div className="tweet-card__header">
            <Link
              to={`/users/${tweet.user_id}`}
              className="tweet-card__author"
              onClick={(e) => e.stopPropagation()}
            >
              <strong>{author ? author.display_name : `User #${tweet.user_id}`}</strong>
              <span className="tweet-card__username">
                @{author ? author.username : tweet.user_id}
              </span>
            </Link>
            <span className="tweet-card__time">{timeAgo(tweet.created_at)}</span>
          </div>

          <p className={large ? "tweet-card__content tweet-card__content--large" : "tweet-card__content"}>
            {tweet.content}
          </p>

          {tweet.image_url && (
            <img src={tweet.image_url} alt="" className="tweet-card__image" />
          )}

          <div className="tweet-card__actions">
            <span className="tweet-card__stat">
              {tweet.reply_count} {tweet.reply_count === 1 ? "reply" : "replies"}
            </span>
            <button type="button" className={liked ? "liked" : ""} onClick={toggleLike} disabled={pending}>
              {liked ? "♥" : "♡"} {likeCount}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
