import { useCallback, useEffect, useState } from "react";
import { createTweet, getRandomTweets, getTimeline, listFollowing } from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";

export default function Timeline() {
  const { currentUser } = useUser();
  const [tab, setTab] = useState("followed");
  const [tweets, setTweets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "followed") {
        setTweets(await getTimeline(currentUser.id));
      } else {
        const following = await listFollowing(currentUser.id);
        const excludeUserIds = [currentUser.id, ...following.map((u) => u.id)];
        setTweets(await getRandomTweets({ excludeUserIds }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(content, imageUrl) {
    await createTweet({ userId: currentUser.id, content, imageUrl });
  }

  return (
    <div className="page">
      <h2>Timeline</h2>

      <div className="profile-tabs">
        <button className={tab === "followed" ? "active" : ""} onClick={() => setTab("followed")}>
          Followed
        </button>
        <button className={tab === "suggested" ? "active" : ""} onClick={() => setTab("suggested")}>
          Suggested
        </button>
      </div>

      {tab === "followed" ? (
        <p className="timeline-hint">
          Fed by fan-out-on-write (tweet-service → outbox → Redis Stream → fan-out worker → your
          followees' feeds), so it won't include your own tweets — following is directed, and
          self-follows are blocked. Check your profile to see what you've posted.
        </p>
      ) : (
        <p className="timeline-hint">
          A sample of tweets from people you don't follow — good for finding someone new.
        </p>
      )}

      <ComposeBox onSubmit={handlePost} />

      <button type="button" className="refresh-button" onClick={load} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
      {error && <p className="error">{error}</p>}
      <div className="tweet-list">
        {tweets.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} />
        ))}
        {!loading && tweets.length === 0 && (
          <p>
            {tab === "followed"
              ? "Your timeline is empty. Follow someone from their profile page to see their tweets here."
              : "Nothing left to discover right now — you're following everyone who's tweeted."}
          </p>
        )}
      </div>
    </div>
  );
}
