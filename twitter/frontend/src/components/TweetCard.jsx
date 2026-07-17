import { useState } from "react";
import { Link } from "react-router-dom";
import { likeTweet, unlikeTweet } from "../api/client";
import { useAuthor } from "../hooks/useAuthor";
import { useUser } from "../context/UserContext";

function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function TweetCard({ tweet }) {
  const author = useAuthor(tweet.user_id);
  const { currentUser } = useUser();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(tweet.like_count);
  const [pending, setPending] = useState(false);

  async function toggleLike() {
    if (!currentUser || pending) return;
    setPending(true);
    try {
      if (liked) {
        await unlikeTweet(tweet.id, currentUser.id);
        setLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await likeTweet(tweet.id, currentUser.id);
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch {
      // conflict (already liked/unliked, e.g. from another tab) — leave state as-is
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="tweet-card">
      <div className="tweet-card__header">
        <Link to={`/users/${tweet.user_id}`} className="tweet-card__author">
          <strong>{author ? author.display_name : `User #${tweet.user_id}`}</strong>
          <span className="tweet-card__username">@{author ? author.username : tweet.user_id}</span>
        </Link>
        <span className="tweet-card__time">{timeAgo(tweet.created_at)}</span>
      </div>

      <Link to={`/tweets/${tweet.id}`} className="tweet-card__content">
        {tweet.content}
      </Link>

      <div className="tweet-card__actions">
        <Link to={`/tweets/${tweet.id}`} className="tweet-card__reply-link">
          Replies
        </Link>
        <button type="button" className={liked ? "liked" : ""} onClick={toggleLike} disabled={pending}>
          {liked ? "♥" : "♡"} {likeCount}
        </button>
      </div>
    </article>
  );
}
