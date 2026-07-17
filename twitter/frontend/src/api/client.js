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
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = res.status;
    throw error;
  }
  return data;
}

// user-service
export function createUser({ username, displayName, avatarUrl }) {
  return request(GATEWAY.user, "/users", {
    method: "POST",
    body: JSON.stringify({ username, display_name: displayName, avatar_url: avatarUrl }),
  });
}

export function getAvatarUploadUrl(contentType) {
  return request(GATEWAY.user, "/users/avatar-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
}

export function updateAvatar(userId, avatarUrl) {
  return request(GATEWAY.user, `/users/${userId}/avatar`, {
    method: "PATCH",
    body: JSON.stringify({ avatar_url: avatarUrl }),
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

export function getRandomUsers({ limit = 10, exclude = [] } = {}) {
  const excludeQuery = exclude.map((id) => `exclude=${id}`).join("&");
  return request(GATEWAY.user, `/users/random?limit=${limit}${excludeQuery ? `&${excludeQuery}` : ""}`);
}

// tweet-service
export function createTweet({ userId, content, imageUrl }) {
  return request(GATEWAY.tweet, "/tweets", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content, image_url: imageUrl }),
  });
}

export function getTweetImageUploadUrl(contentType) {
  return request(GATEWAY.tweet, "/tweets/image-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
}

export async function uploadToPresignedUrl(url, blob) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  if (!res.ok) throw new Error(`Image upload failed with status ${res.status}`);
}

export function getTweet(tweetId) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}`);
}

export function listUserTweets(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.tweet, `/users/${userId}/tweets?limit=${limit}&offset=${offset}`);
}

export function listUserReplies(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.tweet, `/users/${userId}/replies?limit=${limit}&offset=${offset}`);
}

export function listUserLikes(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.tweet, `/users/${userId}/likes?limit=${limit}&offset=${offset}`);
}

export function getLikedTweetIds(userId, tweetIds) {
  if (tweetIds.length === 0) return Promise.resolve([]);
  const query = tweetIds.map((id) => `tweet_ids=${id}`).join("&");
  return request(GATEWAY.tweet, `/users/${userId}/liked-tweet-ids?${query}`);
}

export function createReply(tweetId, { userId, content, imageUrl }) {
  return request(GATEWAY.tweet, `/tweets/${tweetId}/replies`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content, image_url: imageUrl }),
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

export function getRandomTweets({ limit = 20, excludeUserIds = [] } = {}) {
  const excludeQuery = excludeUserIds.map((id) => `exclude_user_ids=${id}`).join("&");
  return request(GATEWAY.tweet, `/tweets/random?limit=${limit}${excludeQuery ? `&${excludeQuery}` : ""}`);
}

// timeline-service
export function getTimeline(userId, { limit = 20, offset = 0 } = {}) {
  return request(GATEWAY.timeline, `/users/${userId}/timeline?limit=${limit}&offset=${offset}`);
}
