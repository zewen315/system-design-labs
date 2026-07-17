import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  followUser,
  getLikedTweetIds,
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
import ReplyRow from "../components/ReplyRow";
import PeopleList from "../components/PeopleList";

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
  const [likedIds, setLikedIds] = useState(new Set());
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [viewerFollowingIds, setViewerFollowingIds] = useState(new Set());
  const [tab, setTab] = useState("tweets");
  const [error, setError] = useState(null);
  const [followPending, setFollowPending] = useState(false);
  const [rowPendingId, setRowPendingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [profileData, tweetData, replyData, likeData, followerData, followingData, viewerFollowingData] =
        await Promise.all([
          getUser(userId),
          listUserTweets(userId),
          listUserReplies(userId),
          listUserLikes(userId),
          listFollowers(userId),
          listFollowing(userId),
          listFollowing(currentUser.id),
        ]);
      setProfile(profileData);
      setTweets(tweetData);
      setReplies(replyData);
      setLikes(likeData);
      setFollowers(followerData);
      setFollowing(followingData);
      setViewerFollowingIds(new Set(viewerFollowingData.map((u) => u.id)));

      const tweetIds = [...tweetData, ...replyData, ...likeData].map((t) => t.id);
      setLikedIds(new Set(await getLikedTweetIds(currentUser.id, tweetIds)));
    } catch (err) {
      setError(err.message);
    }
  }, [userId, currentUser.id]);

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

  async function toggleFollowPerson(personId) {
    setRowPendingId(personId);
    try {
      if (viewerFollowingIds.has(personId)) {
        await unfollowUser(currentUser.id, personId);
      } else {
        await followUser(currentUser.id, personId);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRowPendingId(null);
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
            <TweetCard key={tweet.id} tweet={tweet} likedByMe={likedIds.has(tweet.id)} />
          ))}
          {tweets.length === 0 && <p>No tweets yet.</p>}
        </div>
      )}
      {tab === "replies" && (
        <div className="reply-list">
          {replies.map((reply) => (
            <ReplyRow key={reply.id} tweet={reply} likedByMe={likedIds.has(reply.id)} showParentLink />
          ))}
          {replies.length === 0 && <p>No replies yet.</p>}
        </div>
      )}
      {tab === "likes" && (
        <div className="tweet-list">
          {likes.map((tweet) => (
            <TweetCard key={tweet.id} tweet={tweet} likedByMe={likedIds.has(tweet.id)} />
          ))}
          {likes.length === 0 && <p>No liked tweets yet.</p>}
        </div>
      )}
      {tab === "followers" && (
        <PeopleList
          people={followers}
          followingIds={viewerFollowingIds}
          pendingId={rowPendingId}
          onToggle={toggleFollowPerson}
          emptyLabel="No followers yet."
          viewerId={currentUser.id}
        />
      )}
      {tab === "following" && (
        <PeopleList
          people={following}
          followingIds={viewerFollowingIds}
          pendingId={rowPendingId}
          onToggle={toggleFollowPerson}
          emptyLabel="Not following anyone yet."
          viewerId={currentUser.id}
        />
      )}
    </div>
  );
}
