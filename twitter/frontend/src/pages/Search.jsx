import { useState } from "react";
import {
  followUser,
  getLikedTweetIds,
  listFollowing,
  searchTweets,
  searchUsers,
  unfollowUser,
} from "../api/client";
import { useUser } from "../context/UserContext";
import TweetCard from "../components/TweetCard";
import PeopleList from "../components/PeopleList";
import EmptyState from "../components/EmptyState";

const PAGE_SIZE = 20;

export default function Search() {
  const { currentUser } = useUser();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [tab, setTab] = useState("tweets");

  const [tweets, setTweets] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [people, setPeople] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [pendingId, setPendingId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  async function runSearch(q) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setSubmittedQuery(trimmed);
    try {
      const [tweetData, peopleData, followingData] = await Promise.all([
        searchTweets(trimmed, { limit: PAGE_SIZE, offset: 0 }),
        searchUsers(trimmed, { limit: PAGE_SIZE }),
        listFollowing(currentUser.id),
      ]);
      const liked = await getLikedTweetIds(currentUser.id, tweetData.map((t) => t.id));

      setTweets(tweetData);
      setLikedIds(new Set(liked));
      setOffset(tweetData.length);
      setHasMore(tweetData.length === PAGE_SIZE);
      setPeople(peopleData);
      setFollowingIds(new Set(followingData.map((u) => u.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreTweets() {
    setLoadingMore(true);
    try {
      const page = await searchTweets(submittedQuery, { limit: PAGE_SIZE, offset });
      const newIds = await getLikedTweetIds(currentUser.id, page.map((t) => t.id));

      setTweets((prev) => [...prev, ...page]);
      setOffset((prev) => prev + page.length);
      setHasMore(page.length === PAGE_SIZE);
      setLikedIds((prev) => new Set([...prev, ...newIds]));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function togglePersonFollow(personId) {
    setPendingId(personId);
    try {
      if (followingIds.has(personId)) {
        await unfollowUser(currentUser.id, personId);
      } else {
        await followUser(currentUser.id, personId);
      }
      const followingData = await listFollowing(currentUser.id);
      setFollowingIds(new Set(followingData.map((u) => u.id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingId(null);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(query);
  }

  return (
    <div className="page">
      <h2>Search</h2>

      <form className="search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tweets or people"
        />
        <button type="submit" disabled={!query.trim() || loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {searched && (
        <>
          <div className="profile-tabs">
            <button className={tab === "tweets" ? "active" : ""} onClick={() => setTab("tweets")}>
              Tweets
            </button>
            <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
              People
            </button>
          </div>

          {tab === "tweets" && (
            <div className="tweet-list">
              {tweets.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} likedByMe={likedIds.has(tweet.id)} />
              ))}
              {!loading && tweets.length === 0 && (
                <EmptyState message={`No tweets found for "${submittedQuery}".`} />
              )}
            </div>
          )}
          {tab === "tweets" && hasMore && tweets.length > 0 && (
            <button
              type="button"
              className="tweet-card__load-more"
              onClick={loadMoreTweets}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more tweets"}
            </button>
          )}
          {tab === "tweets" && !hasMore && tweets.length > 0 && (
            <p className="end-of-list">No more tweets.</p>
          )}

          {tab === "people" && (
            <PeopleList
              people={people}
              followingIds={followingIds}
              pendingId={pendingId}
              onToggle={togglePersonFollow}
              emptyLabel={`No people found for "${submittedQuery}".`}
              viewerId={currentUser.id}
            />
          )}
        </>
      )}
    </div>
  );
}
