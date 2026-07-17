const GATEWAY = {
  user: "/api/user-service",
  tweet: "/api/tweet-service",
  timeline: "/api/timeline-service",
};

async function request(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail ?? `Request failed with ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

// user-service
export function createUser({ username, displayName }) {
  return request(GATEWAY.user, "/users", {
    method: "POST",
    body: JSON.stringify({ username, display_name: displayName }),
  });
}

export function getUserByUsername(username) {
  return request(GATEWAY.user, `/users/by-username/${encodeURIComponent(username)}`);
}

export function getUser(userId) {
  return request(GATEWAY.user, `/users/${userId}`);
}

export function followUser(followerId, followeeId) {
  return request(GATEWAY.user, `/users/${followerId}/following/${followeeId}`, {
    method: "POST",
  });
}

export function unfollowUser(followerId, followeeId) {
  return request(GATEWAY.user, `/users/${followerId}/following/${followeeId}`, {
    method: "DELETE",
  });
}

export function listFollowers(userId) {
  return request(GATEWAY.user, `/users/${userId}/followers`);
}

export function listFollowing(userId) {
  return request(GATEWAY.user, `/users/${userId}/following`);
}

// tweet-service
export function createTweet({ userId, content }) {
  return request(GATEWAY.tweet, "/tweets", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content }),
  });
}

export function getTweet(tweetId) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}`);
}

export function listUserTweets(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.tweet, `/users/${userId}/tweets?limit=${limit}&offset=${offset}`);
}

export function createReply(tweetId, { userId, content }) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}/replies`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content }),
  });
}

export function listReplies(tweetId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}/replies?limit=${limit}&offset=${offset}`);
}

export function likeTweet(tweetId, userId) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}/likes/${userId}`, {
    method: "POST",
  });
}

export function unlikeTweet(tweetId, userId) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}/likes/${userId}`, {
    method: "DELETE",
  });
}

// timeline-service
export function getTimeline(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.timeline, `/users/${userId}/timeline?limit=${limit}&offset=${offset}`);
}
