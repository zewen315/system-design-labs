import json
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, Query, Response

from app.config import settings
from app.redis_clients import timeline_redis
from app.schemas import NotificationCreate, NotificationOut, NotificationReadRequest, TweetOut

app = FastAPI(title="timeline-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/users/{follower_id}/backfill/{followee_id}", status_code=204)
def backfill_new_follow(follower_id: int, followee_id: int) -> Response:
    """Fan-out-on-write only pushes at tweet-creation time, never retroactively —
    without this, a fresh follow stays invisible in the follower's timeline until
    the followee's *next* tweet. Called right after a follow is created, this
    pulls the followee's recent tweets and seeds them into the new follower's
    feed the same way fan_out_tweet does, so the follow feels immediate.

    Deliberately scoped to top-level tweets only (reusing tweet-service's
    /users/{id}/tweets, which already excludes replies) — live fan-out also
    pushes replies (a pre-existing quirk, not something this changes), but
    backfilling someone's replies-to-other-people on a fresh follow would read
    as clutter, not "their recent posts."
    """
    resp = httpx.get(f"{settings.tweet_service_url}/users/{followee_id}/tweets")
    resp.raise_for_status()

    feed_key = f"timeline:{follower_id}"
    for tweet in resp.json():
        score = datetime.fromisoformat(tweet["created_at"]).timestamp()
        timeline_redis.zadd(feed_key, {str(tweet["id"]): score})
    timeline_redis.zremrangebyrank(feed_key, 0, -(settings.feed_max_size + 1))

    return Response(status_code=204)


@app.get("/users/{user_id}/timeline", response_model=list[TweetOut])
def get_timeline(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[TweetOut]:
    feed_key = f"timeline:{user_id}"
    tweet_ids = timeline_redis.zrevrange(feed_key, offset, offset + limit - 1)
    if not tweet_ids:
        return []

    resp = httpx.get(
        f"{settings.tweet_service_url}/tweets",
        params=[("ids", tweet_id) for tweet_id in tweet_ids],
    )
    resp.raise_for_status()
    tweets_by_id = {str(tweet["id"]): tweet for tweet in resp.json()}

    return [
        TweetOut(**tweets_by_id[tweet_id])
        for tweet_id in tweet_ids
        if tweet_id in tweets_by_id
    ]


@app.post("/users/{user_id}/notifications", status_code=204)
def create_notification(user_id: int, body: NotificationCreate) -> Response:
    """Direct write path for low-volume event types (currently just follows)
    that don't go through tweet-service's outbox/stream - see fanout_worker
    for the high-volume path (likes, replies), which writes into the same
    notifications:{user_id} sorted set from the other direction.
    """
    if body.actor_user_id == user_id:
        return Response(status_code=204)

    created_at = datetime.now(timezone.utc)
    key = f"notifications:{user_id}"
    notification = {
        "type": body.type,
        "actor_user_id": body.actor_user_id,
        "tweet_id": body.tweet_id,
        "created_at": created_at.isoformat(),
    }
    # A sorted set scored by created_at - not a list appended to in
    # processing order - because the two write paths race: likes/replies
    # go through tweet-service's outbox + a polling relay + a stream
    # consumer, while this follow path writes synchronously and
    # immediately. Insertion order between them doesn't reflect true
    # chronological order, the same reason timeline:{user_id} is a sorted
    # set scored by tweet creation time rather than a plain list.
    timeline_redis.zadd(key, {json.dumps(notification): created_at.timestamp()})
    timeline_redis.zremrangebyrank(key, 0, -(settings.notification_max_size + 1))
    return Response(status_code=204)


@app.get("/users/{user_id}/notifications", response_model=list[NotificationOut])
def list_notifications(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[NotificationOut]:
    raw = timeline_redis.zrevrange(f"notifications:{user_id}", offset, offset + limit - 1)
    return [NotificationOut(**json.loads(item)) for item in raw]


@app.get("/users/{user_id}/notifications/unread-count")
def unread_notification_count(user_id: int) -> dict[str, int]:
    last_read_raw = timeline_redis.get(f"notifications:{user_id}:last_read")
    min_score = f"({datetime.fromisoformat(last_read_raw).timestamp()}" if last_read_raw else "-inf"
    count = timeline_redis.zcount(f"notifications:{user_id}", min_score, "+inf")
    return {"unread_count": count}


@app.post("/users/{user_id}/notifications/read", status_code=204)
def mark_notifications_read(user_id: int, body: NotificationReadRequest) -> Response:
    key = f"notifications:{user_id}:last_read"
    existing_raw = timeline_redis.get(key)
    existing = datetime.fromisoformat(existing_raw) if existing_raw else None
    if existing is None or body.read_through > existing:
        timeline_redis.set(key, body.read_through.isoformat())
    return Response(status_code=204)
