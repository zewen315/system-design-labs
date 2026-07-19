import typesense
from typesense.exceptions import ObjectAlreadyExists

from app.config import settings

client = typesense.Client(
    {
        "api_key": settings.typesense_api_key,
        "nodes": [
            {
                "host": settings.typesense_host,
                "port": settings.typesense_port,
                "protocol": settings.typesense_protocol,
            }
        ],
        "connection_timeout_seconds": 5,
    }
)

TWEETS_COLLECTION = "tweets"
USERS_COLLECTION = "users"

TWEETS_SCHEMA = {
    "name": TWEETS_COLLECTION,
    "fields": [
        {"name": "tweet_id", "type": "int32"},
        {"name": "user_id", "type": "int32"},
        {"name": "content", "type": "string"},
        {"name": "created_at", "type": "int64"},
    ],
    "default_sorting_field": "created_at",
}

# No custom analyzer needed for prefix search the way OpenSearch's edge-ngram
# tokenizer was - Typesense's `prefix` search parameter does this natively
# per query, so username/display_name stay plain string fields.
USERS_SCHEMA = {
    "name": USERS_COLLECTION,
    "fields": [
        {"name": "user_id", "type": "int32"},
        {"name": "username", "type": "string"},
        {"name": "display_name", "type": "string"},
    ],
}


def ensure_collections() -> None:
    # search-service and search-indexer-worker both call this at their own
    # startup, and both come up as soon as Typesense is healthy - the
    # `in` check alone leaves a window where both processes see "not
    # created yet" and both call create(), so the loser needs its
    # already-exists error caught rather than crashing the container.
    for name, schema in [(TWEETS_COLLECTION, TWEETS_SCHEMA), (USERS_COLLECTION, USERS_SCHEMA)]:
        if name in client.collections:
            continue
        try:
            client.collections.create(schema)
        except ObjectAlreadyExists:
            pass
