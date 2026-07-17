import { useEffect, useState } from "react";
import { getUser } from "../api/client";

const cache = new Map();
const inflight = new Map();

export function useAuthor(userId) {
  const [author, setAuthor] = useState(() => cache.get(userId) ?? null);

  useEffect(() => {
    if (cache.has(userId)) {
      setAuthor(cache.get(userId));
      return;
    }

    let cancelled = false;
    const promise =
      inflight.get(userId) ??
      getUser(userId).then((user) => {
        cache.set(userId, user);
        return user;
      });
    inflight.set(userId, promise);

    promise
      .then((user) => {
        if (!cancelled) setAuthor(user);
      })
      .catch(() => {
        if (!cancelled) setAuthor(null);
      })
      .finally(() => {
        inflight.delete(userId);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return author;
}
