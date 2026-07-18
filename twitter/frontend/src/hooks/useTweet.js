import { useEffect, useState } from "react";
import { getTweet } from "../api/client";

const cache = new Map();
const inflight = new Map();

export function useTweet(tweetId) {
  const [tweet, setTweet] = useState(() => (tweetId ? (cache.get(tweetId) ?? null) : null));

  useEffect(() => {
    if (!tweetId) {
      setTweet(null);
      return;
    }
    if (cache.has(tweetId)) {
      setTweet(cache.get(tweetId));
      return;
    }

    let cancelled = false;
    const promise =
      inflight.get(tweetId) ??
      getTweet(tweetId).then((t) => {
        cache.set(tweetId, t);
        return t;
      });
    inflight.set(tweetId, promise);

    promise
      .then((t) => {
        if (!cancelled) setTweet(t);
      })
      .catch(() => {
        if (!cancelled) setTweet(null);
      })
      .finally(() => {
        inflight.delete(tweetId);
      });

    return () => {
      cancelled = true;
    };
  }, [tweetId]);

  return tweet;
}
