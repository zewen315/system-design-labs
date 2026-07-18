from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Query

from app.config import settings
from app.opensearch_client import TWEETS_INDEX, USERS_INDEX, client, ensure_indices
from app.schemas import TweetOut, UserIndexRequest, UserOut


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    ensure_indices()
    yield


app = FastAPI(title="search-service", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/search/tweets", response_model=list[TweetOut])
def search_tweets(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[TweetOut]:
    result = client.search(
        index=TWEETS_INDEX,
        body={
            "query": {"match": {"content": q}},
            "from": offset,
            "size": limit,
        },
    )
    tweet_ids = [hit["_source"]["tweet_id"] for hit in result["hits"]["hits"]]
    if not tweet_ids:
        return []

    # OpenSearch only stores what's needed to search and rank - the
    # authoritative tweet data (like_count, reply_count, etc.) still comes
    # from tweet-service, the same ID-first hydration pattern timelines
    # already use, so search results can never show stale counts.
    resp = httpx.get(
        f"{settings.tweet_service_url}/tweets",
        params=[("ids", tweet_id) for tweet_id in tweet_ids],
    )
    resp.raise_for_status()
    tweets_by_id = {tweet["id"]: tweet for tweet in resp.json()}

    # Re-order to match OpenSearch's relevance ranking - tweet-service's
    # bulk lookup has no reason to preserve it.
    return [TweetOut(**tweets_by_id[tid]) for tid in tweet_ids if tid in tweets_by_id]


@app.get("/search/users", response_model=list[UserOut])
def search_users(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[UserOut]:
    result = client.search(
        index=USERS_INDEX,
        body={
            "query": {
                "multi_match": {
                    "query": q,
                    "fields": ["username.autocomplete^2", "username", "display_name"],
                }
            },
            "size": limit,
        },
    )
    user_ids = [hit["_source"]["user_id"] for hit in result["hits"]["hits"]]
    if not user_ids:
        return []

    resp = httpx.get(
        f"{settings.user_service_url}/users", params=[("ids", user_id) for user_id in user_ids]
    )
    resp.raise_for_status()
    users_by_id = {user["id"]: user for user in resp.json()}

    return [UserOut(**users_by_id[uid]) for uid in user_ids if uid in users_by_id]


@app.post("/users/{user_id}/index", status_code=204)
def index_user(user_id: int, body: UserIndexRequest) -> None:
    """Direct write path called synchronously (best-effort) by user-service
    right after account creation. Users have no outbox/stream of their own —
    same reasoning as the notification system's follow path: this is far
    lower-volume than tweet creation, which is why tweets get indexed through
    tweet-service's existing outbox + a second consumer group on the same
    stream (see indexer_worker.py) instead.
    """
    client.index(
        index=USERS_INDEX,
        id=str(user_id),
        body={"user_id": user_id, "username": body.username, "display_name": body.display_name},
    )
