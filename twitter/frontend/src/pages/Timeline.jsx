import { useCallback, useEffect, useState } from "react";
import {
  createTweet,
  getLikedTweetIds,
  getRandomTweets,
  getTimeline,
  listFollowing,
} from "../api/client";
import { useUser } from "../context/UserContext";
import ComposeBox from "../components/ComposeBox";
import TweetCard from "../components/TweetCard";
import EmptyState from "../components/EmptyState";

export default function Timeline() {
  const { currentUser } = useUser();
  const [tab, setTab] = useState("followed");
  const [tweets, setTweets] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data;
      if (tab === "followed") {
        data = await getTimeline(currentUser.id);
      } else {
        const following = await listFollowing(currentUser.id);
        const excludeUserIds = [currentUser.id, ...following.map((u) => u.id)];
        data = await getRandomTweets({ excludeUserIds });
      }
      const liked = await getLikedTweetIds(currentUser.id, data.map((t) => t.id));
      setTweets(data);
      setLikedIds(new Set(liked));
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

      {tab === "suggested" && (
        <p className="timeline-hint">
          A sample of tweets from people you don't follow — good for finding someone new.
        </p>
      )}

      <ComposeBox onSubmit={handlePost} />

      {error && <p className="error">{error}</p>}
      <div className="tweet-list">
        {tweets.map((tweet) => (
          <TweetCard key={tweet.id} tweet={tweet} likedByMe={likedIds.has(tweet.id)} />
        ))}
        {!loading && tweets.length === 0 && (
          <EmptyState
            message={
              tab === "followed"
                ? "Your timeline is empty. Follow someone from their profile page to see their tweets here."
                : "Nothing left to discover right now — you're following everyone who's tweeted."
            }
          />
        )}
      </div>
    </div>
  );
}
