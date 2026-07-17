import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createReply, getTweet, listReplies } from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";
import { ArrowLeftIcon } from "../components/icons";

const REPLIES_PAGE_SIZE = 20;

export default function Post() {
  const { tweetId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [tweet, setTweet] = useState(null);
  const [replies, setReplies] = useState([]);
  const [repliesOffset, setRepliesOffset] = useState(0);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTweet(null);
    setReplies([]);
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
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  async function loadMoreReplies() {
    setRepliesLoading(true);
    try {
      const page = await listReplies(tweetId, { limit: REPLIES_PAGE_SIZE, offset: repliesOffset });
      setReplies((prev) => [...prev, ...page]);
      setRepliesOffset((prev) => prev + page.length);
      setHasMoreReplies(page.length === REPLIES_PAGE_SIZE);
    } catch (err) {
      setError(err.message);
    } finally {
      setRepliesLoading(false);
    }
  }

  async function handleReply(content) {
    const reply = await createReply(tweetId, { userId: currentUser.id, content });
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

      <TweetCard tweet={tweet} clickable={false} />

      <ComposeBox placeholder="Post your reply" buttonLabel="Reply" onSubmit={handleReply} />

      <div className="tweet-list">
        {replies.map((reply) => (
          <TweetCard key={reply.id} tweet={reply} />
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
