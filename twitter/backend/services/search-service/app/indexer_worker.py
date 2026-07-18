import json

import redis

from app.config import settings
from app.opensearch_client import TWEETS_INDEX, client, ensure_indices
from app.redis_clients import stream_redis


def ensure_consumer_group() -> None:
    # A second, independent consumer group on tweet-service's existing
    # tweet-events stream — Redis Streams track each group's own offset and
    # pending-entries-list, so this reads every tweet_created event from the
    # beginning of time (from this group's perspective) without touching or
    # interfering with timeline-service's timeline-fanout group on the same
    # stream.
    try:
        stream_redis.xgroup_create(
            settings.tweet_events_stream,
            settings.indexer_consumer_group,
            id="0",
            mkstream=True,
        )
    except redis.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def index_tweet(payload: dict) -> None:
    client.index(
        index=TWEETS_INDEX,
        id=str(payload["tweet_id"]),
        body={
            "tweet_id": payload["tweet_id"],
            "user_id": payload["user_id"],
            "content": payload["content"],
            "created_at": payload["created_at"],
        },
    )


def handle_event(event_type: str, payload: dict) -> None:
    if event_type == "tweet_created":
        index_tweet(payload)


def main() -> None:
    # This worker and search-service's own FastAPI process both start as
    # soon as OpenSearch is healthy - whichever writes first would otherwise
    # auto-create the index with a dynamic mapping (no english analyzer),
    # silently discarding the explicit mapping search-service's lifespan sets
    # up. ensure_indices() is idempotent (checks existence first), so calling
    # it from both places just means whichever process starts first wins.
    ensure_indices()
    ensure_consumer_group()
    print(f"search indexer started, consumer group={settings.indexer_consumer_group}")

    while True:
        response = stream_redis.xreadgroup(
            settings.indexer_consumer_group,
            settings.indexer_consumer_name,
            {settings.tweet_events_stream: ">"},
            count=10,
            block=5000,
        )
        if not response:
            continue

        for _stream_name, messages in response:
            for message_id, fields in messages:
                try:
                    handle_event(fields["event_type"], json.loads(fields["payload"]))
                    stream_redis.xack(
                        settings.tweet_events_stream,
                        settings.indexer_consumer_group,
                        message_id,
                    )
                except Exception as exc:
                    print(f"failed to process {message_id}: {exc}")


if __name__ == "__main__":
    main()
