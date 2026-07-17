import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  followUser,
  getUser,
  listFollowers,
  listFollowing,
  listUserLikes,
  listUserReplies,
  listUserTweets,
  unfollowUser,
} from "../api/client";
import { useUser } from "../context/UserContext";
import Avatar from "../components/Avatar";
import TweetCard from "../components/TweetCard";
import UserList from "../components/UserList";

function formatJoinDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Profile() {
  const { userId } = useParams();
  const { currentUser } = useUser();
  const [profile, setProfile] = useState(null);
  const [tweets, setTweets] = useState([]);
  const [replies, setReplies] = useState([]);
  const [likes, setLikes] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [tab, setTab] = useState("tweets");
  const [error, setError] = useState(null);
  const [followPending, setFollowPending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profileData, tweetData, replyData, likeData, followerData, followingData] =
        await Promise.all([
          getUser(userId),
          listUserTweets(userId),
          listUserReplies(userId),
          listUserLikes(userId),
          listFollowers(userId),
          listFollowing(userId),
        ]);
      setProfile(profileData);
      setTweets(tweetData);
      setReplies(replyData);
      setLikes(likeData);
      setFollowers(followerData);
      setFollowing(followingData);
    } catch (err) {
      setError(err.message);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = currentUser && String(currentUser.id) === String(userId);
  const isFollowing = currentUser && followers.some((f) => f.id === currentUser.id);

  async function toggleFollow() {
    if (!currentUser || followPending) return;
    setFollowPending(true);
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.id, userId);
      } else {
        await followUser(currentUser.id, userId);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setFollowPending(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!profile) return <p>Loading...</p>;

  return (
    <div className="page">
      <div className="profile-banner" />

      <div className="profile-header">
        <div className="profile-header__top">
          <Avatar user={profile} size={72} />
          <div>
            <h2>{profile.display_name}</h2>
            <p className="profile-username">@{profile.username}</p>
          </div>
        </div>
        <p className="profile-joined">Joined {formatJoinDate(profile.created_at)}</p>
        <div className="profile-stats">
          <span>{followers.length} followers</span>
          <span>{following.length} following</span>
        </div>
        {!isSelf && currentUser && (
          <button type="button" onClick={toggleFollow} disabled={followPending}>
            {isFollowing ? "Unfollow" : "Follow"}
          </button>
        )}
      </div>

      <div className="profile-tabs">
        <button className={tab === "tweets" ? "active" : ""} onClick={() => setTab("tweets")}>
          Tweets
        </button>
        <button className={tab === "replies" ? "active" : ""} onClick={() => setTab("replies")}>
          Replies
        </button>
        <button className={tab === "likes" ? "active" : ""} onClick={() => setTab("likes")}>
          Likes
        </button>
        <button className={tab === "followers" ? "active" : ""} onClick={() => setTab("followers")}>
          Followers
        </button>
        <button className={tab === "following" ? "active" : ""} onClick={() => setTab("following")}>
          Following
        </button>
      </div>

      {tab === "tweets" && (
        <div className="tweet-list">
          {tweets.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} />
          ))}
          {tweets.length === 0 && <p>No tweets yet.</p>}
        </div>
      )}
      {tab === "replies" && (
        <div className="tweet-list">
          {replies.map((reply) => (
            <TweetCard key={reply.id} tweet={reply} />
          ))}
          {replies.length === 0 && <p>No replies yet.</p>}
        </div>
      )}
      {tab === "likes" && (
        <div className="tweet-list">
          {likes.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} />
          ))}
          {likes.length === 0 && <p>No liked tweets yet.</p>}
        </div>
      )}
      {tab === "followers" && <UserList users={followers} emptyLabel="No followers yet." />}
      {tab === "following" && <UserList users={following} emptyLabel="Not following anyone yet." />}
    </div>
  );
}
