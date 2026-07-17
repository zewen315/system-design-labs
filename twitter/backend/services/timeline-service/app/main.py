from datetime import datetime

import httpx
from fastapi import FastAPI, Query, Response

from app.config import settings
from app.redis_clients import timeline_redis
from app.schemas import TweetOut

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
