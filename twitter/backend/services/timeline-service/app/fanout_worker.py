import json
from datetime import datetime

import httpx
import redis

from app.config import settings
from app.redis_clients import stream_redis, timeline_redis


def ensure_consumer_group() -> None:
    try:
        stream_redis.xgroup_create(
            settings.tweet_events_stream,
            settings.fanout_consumer_group,
            id="0",
            mkstream=True,
        )
    except redis.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


def fan_out_tweet(payload: dict, http_client: httpx.Client) -> None:
    tweet_id = payload["tweet_id"]
    author_id = payload["user_id"]
    score = datetime.fromisoformat(payload["created_at"]).timestamp()

    resp = http_client.get(f"{settings.user_service_url}/users/{author_id}/followers")
    resp.raise_for_status()
    followers = resp.json()

    for follower in followers:
        feed_key = f"timeline:{follower['id']}"
        timeline_redis.zadd(feed_key, {str(tweet_id): score})
        timeline_redis.zremrangebyrank(feed_key, 0, -(settings.feed_max_size + 1))


def handle_event(event_type: str, payload: dict, http_client: httpx.Client) -> None:
    if event_type == "tweet_created":
        fan_out_tweet(payload, http_client)


def main() -> None:
    ensure_consumer_group()
    http_client = httpx.Client(timeout=5.0)
    print(f"fanout worker started, consumer group={settings.fanout_consumer_group}")

    while True:
        response = stream_redis.xreadgroup(
            settings.fanout_consumer_group,
            settings.fanout_consumer_name,
            {settings.tweet_events_stream: ">"},
            count=10,
            block=5000,
        )
        if not response:
            continue

        for _stream_name, messages in response:
            for message_id, fields in messages:
                try:
                    handle_event(
                        fields["event_type"], json.loads(fields["payload"]), http_client
                    )
                    stream_redis.xack(
                        settings.tweet_events_stream,
                        settings.fanout_consumer_group,
                        message_id,
                    )
                except Exception as exc:
                    print(f"failed to process {message_id}: {exc}")


if __name__ == "__main__":
    main()
