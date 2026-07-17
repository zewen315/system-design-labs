import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { followUser, getRandomUsers, getTopFollowedUsers, listFollowing, unfollowUser } from "../api/client";
import { useUser } from "../context/UserContext";

function PeopleList({ people, followingIds, pendingId, onToggle, emptyLabel }) {
  if (people.length === 0) return <p className="user-list__empty">{emptyLabel}</p>;

  return (
    <ul className="people-list">
      {people.map((person) => (
        <li key={person.id}>
          <Link to={`/users/${person.id}`} className="people-list__identity">
            <strong>{person.display_name}</strong>
            <span>@{person.username}</span>
            {"follower_count" in person && (
              <span className="people-list__count">{person.follower_count} followers</span>
            )}
          </Link>
          <button type="button" onClick={() => onToggle(person.id)} disabled={pendingId === person.id}>
            {followingIds.has(person.id) ? "Unfollow" : "Follow"}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Discover() {
  const { currentUser } = useUser();
  const [popular, setPopular] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const following = await listFollowing(currentUser.id);
      const idSet = new Set(following.map((u) => u.id));
      setFollowingIds(idSet);

      const exclude = [currentUser.id, ...idSet];
      const [popularData, suggestedData] = await Promise.all([
        getTopFollowedUsers({ limit: 10 }),
        getRandomUsers({ limit: 10, exclude }),
      ]);
      setPopular(popularData.filter((u) => u.id !== currentUser.id));
      setSuggested(suggestedData);
    } catch (err) {
      setError(err.message);
    }
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow(userId) {
    setPendingId(userId);
    try {
      if (followingIds.has(userId)) {
        await unfollowUser(currentUser.id, userId);
      } else {
        await followUser(currentUser.id, userId);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <div className="page">
      <h2>Discover</h2>

      <section className="discover-section">
        <h3>Popular</h3>
        <p className="discover-section__hint">Most-followed users on the platform.</p>
        <PeopleList
          people={popular}
          followingIds={followingIds}
          pendingId={pendingId}
          onToggle={toggleFollow}
          emptyLabel="Nobody's been followed yet."
        />
      </section>

      <section className="discover-section">
        <h3>Suggested</h3>
        <p className="discover-section__hint">A random sample of people you don't already follow.</p>
        <PeopleList
          people={suggested}
          followingIds={followingIds}
          pendingId={pendingId}
          onToggle={toggleFollow}
          emptyLabel="No one new to suggest right now."
        />
      </section>
    </div>
  );
}
