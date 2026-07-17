import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  followUser,
  getRandomUsers,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "../api/client";
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
          </Link>
          <button type="button" onClick={() => onToggle(person.id)} disabled={pendingId === person.id}>
            {followingIds.has(person.id) ? "Unfollow" : "Follow"}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function Follow() {
  const { currentUser } = useUser();
  const [tab, setTab] = useState("suggested");
  const [suggested, setSuggested] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [followingData, followersData] = await Promise.all([
        listFollowing(currentUser.id),
        listFollowers(currentUser.id),
      ]);
      const idSet = new Set(followingData.map((u) => u.id));
      setFollowing(followingData);
      setFollowers(followersData);
      setFollowingIds(idSet);

      const exclude = [currentUser.id, ...idSet];
      setSuggested(await getRandomUsers({ limit: 10, exclude }));
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

  const lists = {
    suggested: { people: suggested, emptyLabel: "No one new to suggest right now." },
    following: { people: following, emptyLabel: "Not following anyone yet." },
    followers: { people: followers, emptyLabel: "No followers yet." },
  };
  const active = lists[tab];

  return (
    <div className="page">
      <h2>Follow</h2>

      <div className="profile-tabs">
        <button className={tab === "suggested" ? "active" : ""} onClick={() => setTab("suggested")}>
          Suggested
        </button>
        <button className={tab === "following" ? "active" : ""} onClick={() => setTab("following")}>
          Following
        </button>
        <button className={tab === "followers" ? "active" : ""} onClick={() => setTab("followers")}>
          Followers
        </button>
      </div>

      <PeopleList
        people={active.people}
        followingIds={followingIds}
        pendingId={pendingId}
        onToggle={toggleFollow}
        emptyLabel={active.emptyLabel}
      />
    </div>
  );
}
