import { useState } from "react";
import { likeTweet, unlikeTweet } from "../api/client";
import { useUser } from "../context/UserContext";

export function useLikeToggle(tweet, likedByMe = false) {
  const { currentUser } = useUser();
  const [liked, setLiked] = useState(likedByMe);
  const [likeCount, setLikeCount] = useState(tweet.like_count);
  const [pending, setPending] = useState(false);

  async function toggleLike(e) {
    e?.stopPropagation();
    if (!currentUser || pending) return;
    setPending(true);
    try {
      if (liked) {
        await unlikeTweet(tweet.id, currentUser.id);
        setLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await likeTweet(tweet.id, currentUser.id);
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch (err) {
      // Our local `liked` state was wrong relative to the server (e.g. a
      // stale initial value, or liked/unliked from another tab) - the
      // rejection tells us the actual state, so resync to it instead of
      // silently leaving the button stuck showing the wrong thing.
      if (err.status === 409) {
        setLiked(true); // "already liked" - it really is liked
      } else if (err.status === 404) {
        setLiked(false); // "like not found" - it really isn't liked
      }
    } finally {
      setPending(false);
    }
  }

  return { liked, likeCount, pending, toggleLike };
}
