import json
import time
from datetime import datetime, timezone

import redis
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.models import OutboxEvent


def relay_once(db, redis_client) -> int:
    stmt = (
        select(OutboxEvent)
        .where(OutboxEvent.published_at.is_(None))
        .order_by(OutboxEvent.id)
        .limit(settings.outbox_batch_size)
        .with_for_update(skip_locked=True)
    )
    events = list(db.scalars(stmt))
    for event in events:
        redis_client.xadd(
            settings.outbox_stream_name,
            {"event_type": event.event_type, "payload": json.dumps(event.payload)},
        )
        event.published_at = datetime.now(timezone.utc)
    db.commit()
    return len(events)


def main() -> None:
    redis_client = redis.Redis.from_url(settings.redis_url)
    print(f"outbox relay started, polling every {settings.outbox_poll_interval_seconds}s")
    while True:
        db = SessionLocal()
        try:
            published = relay_once(db, redis_client)
            if published:
                print(f"relayed {published} event(s)")
        finally:
            db.close()
        time.sleep(settings.outbox_poll_interval_seconds)


if __name__ == "__main__":
    main()
