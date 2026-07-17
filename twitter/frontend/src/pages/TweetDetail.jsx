import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createReply, getTweet, listReplies } from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";

export default function TweetDetail() {
  const { tweetId } = useParams();
  const { currentUser } = useUser();
  const [tweet, setTweet] = useState(null);
  const [replies, setReplies] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tweetData, replyData] = await Promise.all([getTweet(tweetId), listReplies(tweetId)]);
      setTweet(tweetData);
      setReplies(replyData);
    } catch (err) {
      setError(err.message);
    }
  }, [tweetId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReply(content) {
    await createReply(tweetId, { userId: currentUser.id, content });
    await load();
  }

  if (error) return <p className="error">{error}</p>;
  if (!tweet) return <p>Loading...</p>;

  return (
    <div className="page">
      <TweetCard tweet={tweet} />
      <ComposeBox placeholder="Post your reply" buttonLabel="Reply" onSubmit={handleReply} />
      <div className="tweet-list">
        {replies.map((reply) => (
          <TweetCard key={reply.id} tweet={reply} />
        ))}
        {replies.length === 0 && <p>No replies yet.</p>}
      </div>
    </div>
  );
}
