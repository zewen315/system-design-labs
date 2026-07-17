import { useState } from "react";
import { likeTweet, unlikeTweet } from "../api/client";
import { useUser } from "../context/UserContext";

export function useLikeToggle(tweet) {
  const { currentUser } = useUser();
  const [liked, setLiked] = useState(false);
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
    } catch {
      // conflict (already liked/unliked, e.g. from another tab) — leave state as-is
    } finally {
      setPending(false);
    }
  }

  return { liked, likeCount, pending, toggleLike };
}
