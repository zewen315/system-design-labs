import json
from datetime import datetime

import redis

from app.config import settings
from app.redis_clients import stream_redis
from app.typesense_client import TWEETS_COLLECTION, client, ensure_collections


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
    client.collections[TWEETS_COLLECTION].documents.upsert(
        {
            "id": str(payload["tweet_id"]),
            "tweet_id": payload["tweet_id"],
            "user_id": payload["user_id"],
            "content": payload["content"],
            # Typesense's created_at field is int64 (unix seconds) so it can
            # be a sort field - the outbox payload carries an ISO string.
            "created_at": int(datetime.fromisoformat(payload["created_at"]).timestamp()),
        }
    )


def handle_event(event_type: str, payload: dict) -> None:
    if event_type == "tweet_created":
        index_tweet(payload)


def main() -> None:
    # This worker and search-service's own FastAPI process both start as
    # soon as Typesense is healthy - whichever writes first would otherwise
    # auto-create the collection with an inferred schema, silently
    # discarding the explicit one search-service's lifespan sets up.
    # ensure_collections() is idempotent (checks existence first, and
    # catches the loser's ObjectAlreadyExists), so calling it from both
    # places just means whichever process starts first wins.
    ensure_collections()
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
