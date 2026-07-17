import { useState } from "react";
import { Link } from "react-router-dom";
import { createReply, likeTweet, listReplies, unlikeTweet } from "../api/client";
import { useAuthor } from "../hooks/useAuthor";
import { useUser } from "../context/UserContext";
import ComposeBox from "./ComposeBox";

const REPLIES_PAGE_SIZE = 5;

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

  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesOffset, setRepliesOffset] = useState(0);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(false);

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

  async function loadMoreReplies() {
    setRepliesLoading(true);
    try {
      const page = await listReplies(tweet.id, { limit: REPLIES_PAGE_SIZE, offset: repliesOffset });
      setReplies((prev) => [...prev, ...page]);
      setRepliesOffset((prev) => prev + page.length);
      setHasMoreReplies(page.length === REPLIES_PAGE_SIZE);
    } catch {
      // a failed page fetch just leaves "Load more" clickable to retry
    } finally {
      setRepliesLoading(false);
    }
  }

  function toggleReplies() {
    const opening = !repliesOpen;
    setRepliesOpen(opening);
    if (opening && replies.length === 0) {
      loadMoreReplies();
    }
  }

  async function handleReply(content) {
    const reply = await createReply(tweet.id, { userId: currentUser.id, content });
    setReplies((prev) => [reply, ...prev]);
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

      <p className="tweet-card__content">{tweet.content}</p>

      <div className="tweet-card__actions">
        <button type="button" className="tweet-card__reply-toggle" onClick={toggleReplies}>
          {repliesOpen ? "Hide replies" : "Replies"}
        </button>
        <button type="button" className={liked ? "liked" : ""} onClick={toggleLike} disabled={pending}>
          {liked ? "♥" : "♡"} {likeCount}
        </button>
      </div>

      {repliesOpen && (
        <div className="tweet-card__replies">
          <ComposeBox placeholder="Post your reply" buttonLabel="Reply" onSubmit={handleReply} />

          <div className="tweet-list">
            {replies.map((reply) => (
              <TweetCard key={reply.id} tweet={reply} />
            ))}
          </div>

          {replies.length === 0 && !repliesLoading && <p>No replies yet.</p>}

          {hasMoreReplies && replies.length > 0 && (
            <button
              type="button"
              className="tweet-card__load-more"
              onClick={loadMoreReplies}
              disabled={repliesLoading}
            >
              {repliesLoading ? "Loading..." : "Load more replies"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
