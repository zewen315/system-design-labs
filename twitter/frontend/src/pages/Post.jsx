import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createReply, getLikedTweetIds, getTweet, listReplies } from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";
import ReplyRow from "../components/ReplyRow";
import { ArrowLeftIcon } from "../components/icons";

const REPLIES_PAGE_SIZE = 20;

export default function Post() {
  const { tweetId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [tweet, setTweet] = useState(null);
  const [replies, setReplies] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [repliesOffset, setRepliesOffset] = useState(0);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTweet(null);
    setReplies([]);
    setLikedIds(new Set());
    setRepliesOffset(0);
    setHasMoreReplies(true);

    (async () => {
      try {
        const [tweetData, replyPage] = await Promise.all([
          getTweet(tweetId),
          listReplies(tweetId, { limit: REPLIES_PAGE_SIZE, offset: 0 }),
        ]);
        if (cancelled) return;
        setTweet(tweetData);
        setReplies(replyPage);
        setRepliesOffset(replyPage.length);
        setHasMoreReplies(replyPage.length === REPLIES_PAGE_SIZE);

        const ids = [tweetData.id, ...replyPage.map((r) => r.id)];
        setLikedIds(new Set(await getLikedTweetIds(currentUser.id, ids)));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweetId]);

  async function loadMoreReplies() {
    setRepliesLoading(true);
    try {
      const page = await listReplies(tweetId, { limit: REPLIES_PAGE_SIZE, offset: repliesOffset });
      setReplies((prev) => [...prev, ...page]);
      setRepliesOffset((prev) => prev + page.length);
      setHasMoreReplies(page.length === REPLIES_PAGE_SIZE);

      const newIds = await getLikedTweetIds(currentUser.id, page.map((r) => r.id));
      setLikedIds((prev) => new Set([...prev, ...newIds]));
    } catch (err) {
      setError(err.message);
    } finally {
      setRepliesLoading(false);
    }
  }

  async function handleReply(content, imageUrl) {
    const reply = await createReply(tweetId, { userId: currentUser.id, content, imageUrl });
    setReplies((prev) => [reply, ...prev]);
    setTweet((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
  }

  if (error) return <p className="error">{error}</p>;
  if (!tweet) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="post-header">
        <button type="button" className="post-back-button" onClick={() => navigate(-1)}>
          <ArrowLeftIcon className="post-back-button__icon" />
        </button>
        <h2>Post</h2>
      </div>

      <TweetCard tweet={tweet} clickable={false} large likedByMe={likedIds.has(tweet.id)} />

      <ComposeBox placeholder="Post your reply" buttonLabel="Reply" onSubmit={handleReply} />

      <div className="reply-list">
        {replies.map((reply) => (
          <ReplyRow key={reply.id} tweet={reply} likedByMe={likedIds.has(reply.id)} />
        ))}
      </div>

      {replies.length === 0 && <p>No replies yet.</p>}

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
  );
}
