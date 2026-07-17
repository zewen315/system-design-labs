import { useCallback, useEffect, useState } from "react";
import { createTweet, getTimeline } from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";

export default function Timeline() {
  const { currentUser } = useUser();
  const [tweets, setTweets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTweets(await getTimeline(currentUser.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(content) {
    await createTweet({ userId: currentUser.id, content });
  }

  return (
    <div className="page">
      <h2>Home</h2>
      <ComposeBox onSubmit={handlePost} />
      <p className="timeline-hint">
        This feed is fed by fan-out-on-write (tweet-service → outbox → Redis Stream → fan-out
        worker → your followees' feeds), so it won't include your own tweets — following is
        directed, and self-follows are blocked. Check your profile to see what you've posted.
      </p>
      <button type="button" className="refresh-button" onClick={load} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
      {error && <p className="error">{error}</p>}
      <div className="tweet-list">
        {tweets.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} />
        ))}
        {!loading && tweets.length === 0 && (
          <p>Your timeline is empty. Follow someone from their profile page to see their tweets here.</p>
        )}
      </div>
    </div>
  );
}
