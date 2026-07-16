import httpx
from fastapi import FastAPI, Query

from app.config import settings
from app.redis_clients import timeline_redis
from app.schemas import TweetOut

app = FastAPI(title="timeline-service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
